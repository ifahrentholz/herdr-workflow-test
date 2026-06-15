import { describe, expect, it } from 'vitest';
import {
  createGame,
  createHighscoreStore,
  directions,
  directionFromKey,
  moveDelayMsForScore,
  movesPerSecondForScore,
  primaryActionLabel,
  statusMessage,
} from '../app.js';

const alwaysFirstFreeCell = () => 0;

function memoryStorage(initialEntries = {}) {
  const entries = new Map(Object.entries(initialEntries));

  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
  };
}

describe('highscore storage', () => {
  it('loads a valid stored highscore and exposes it in new game state', () => {
    const store = createHighscoreStore(memoryStorage({ snakeHighscore: '12' }));
    const game = createGame({ random: alwaysFirstFreeCell, highscoreStore: store });

    expect(store.load()).toBe(12);
    expect(game.state.highscore).toBe(12);
  });

  it('treats missing, invalid, negative, fractional, and unsafe stored highscores as zero', () => {
    expect(createHighscoreStore(memoryStorage()).load()).toBe(0);
    expect(createHighscoreStore(memoryStorage({ snakeHighscore: 'not-a-score' })).load()).toBe(0);
    expect(createHighscoreStore(memoryStorage({ snakeHighscore: '-3' })).load()).toBe(0);
    expect(createHighscoreStore(memoryStorage({ snakeHighscore: '1.5' })).load()).toBe(0);
    expect(createHighscoreStore(memoryStorage({ snakeHighscore: '9007199254740992' })).load()).toBe(0);
  });

  it('falls back safely when browser storage throws', () => {
    const throwingStorage = {
      getItem() {
        throw new Error('storage disabled');
      },
      setItem() {
        throw new Error('storage disabled');
      },
    };
    const store = createHighscoreStore(throwingStorage);

    expect(store.load()).toBe(0);
    expect(store.save(5)).toBe(false);
  });

  it('updates and persists highscore only when score beats the current best', () => {
    const storage = memoryStorage({ snakeHighscore: '2' });
    const game = createGame({
      random: () => 0,
      highscoreStore: createHighscoreStore(storage),
      initialSnake: [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 },
      ],
      initialFood: { x: 11, y: 10 },
    });

    game.start();
    game.step();

    expect(game.state.score).toBe(1);
    expect(game.state.highscore).toBe(2);
    expect(storage.getItem('snakeHighscore')).toBe('2');

    game.state.score = 2;
    game.state.food = { x: 12, y: 10 };
    game.step();

    expect(game.state.score).toBe(3);
    expect(game.state.highscore).toBe(3);
    expect(storage.getItem('snakeHighscore')).toBe('3');
  });
});

describe('snake game core', () => {
  it('initializes a 20x20 board in the ready state with a centered snake, free-cell food, and zero score', () => {
    const game = createGame({ random: alwaysFirstFreeCell });

    expect(game.state.gridSize).toBe(20);
    expect(game.state.score).toBe(0);
    expect(game.state.status).toBe('ready');
    expect(game.state.direction).toEqual(directions.RIGHT);
    expect(game.state.snake).toEqual([
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ]);
    expect(game.state.food).toEqual({ x: 0, y: 0 });
  });

  it('maps arrow keys and WASD keys to directions', () => {
    expect(directionFromKey('ArrowUp')).toEqual(directions.UP);
    expect(directionFromKey('w')).toEqual(directions.UP);
    expect(directionFromKey('ArrowLeft')).toEqual(directions.LEFT);
    expect(directionFromKey('a')).toEqual(directions.LEFT);
    expect(directionFromKey('ArrowDown')).toEqual(directions.DOWN);
    expect(directionFromKey('s')).toEqual(directions.DOWN);
    expect(directionFromKey('ArrowRight')).toEqual(directions.RIGHT);
    expect(directionFromKey('d')).toEqual(directions.RIGHT);
    expect(directionFromKey('x')).toBeNull();
  });

  it('moves continuously and prevents direct 180 degree reversal after starting', () => {
    const game = createGame({ random: alwaysFirstFreeCell });
    game.start();

    expect(game.turn(directions.LEFT)).toBe(false);
    game.step();

    expect(game.state.direction).toEqual(directions.RIGHT);
    expect(game.state.snake[0]).toEqual({ x: 11, y: 10 });
    expect(game.state.snake).toHaveLength(3);
  });

  it('ignores a second rapid turn before the next step to prevent reversal into the neck', () => {
    const game = createGame({ random: alwaysFirstFreeCell });
    game.start();

    expect(game.turn(directions.UP)).toBe(true);
    expect(game.turn(directions.LEFT)).toBe(false);
    game.step();

    expect(game.state.direction).toEqual(directions.UP);
    expect(game.state.snake[0]).toEqual({ x: 10, y: 9 });
    expect(game.state.status).toBe('playing');
  });

  it('treats pressing the current direction as a no-op without consuming the queued turn', () => {
    const game = createGame({ random: alwaysFirstFreeCell });
    game.start();

    expect(game.turn(directions.RIGHT)).toBe(false);
    expect(game.turn(directions.UP)).toBe(true);
    game.step();

    expect(game.state.direction).toEqual(directions.UP);
    expect(game.state.snake[0]).toEqual({ x: 10, y: 9 });
  });

  it('wraps around board edges', () => {
    const game = createGame({
      random: alwaysFirstFreeCell,
      initialSnake: [
        { x: 19, y: 10 },
        { x: 18, y: 10 },
        { x: 17, y: 10 },
      ],
    });

    game.start();
    game.step();

    expect(game.state.snake[0]).toEqual({ x: 0, y: 10 });
  });

  it('calculates gradual speed progression every 5 points up to a capped maximum', () => {
    expect(movesPerSecondForScore(0)).toBeCloseTo(7);
    expect(movesPerSecondForScore(4)).toBeCloseTo(7);
    expect(movesPerSecondForScore(5)).toBeCloseTo(8);
    expect(movesPerSecondForScore(10)).toBeCloseTo(9);
    expect(movesPerSecondForScore(35)).toBeCloseTo(14);
    expect(movesPerSecondForScore(100)).toBeCloseTo(14);

    expect(moveDelayMsForScore(0)).toBeCloseTo(1000 / 7);
    expect(moveDelayMsForScore(35)).toBeCloseTo(1000 / 14);
  });

  it('exposes current speed in game state and resets it when a new game starts', () => {
    const game = createGame({
      random: () => 0,
      initialSnake: [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 },
      ],
      initialFood: { x: 11, y: 10 },
    });

    expect(game.state.movesPerSecond).toBeCloseTo(7);
    expect(game.state.moveDelayMs).toBeCloseTo(1000 / 7);

    game.start();
    for (let score = 0; score < 5; score += 1) {
      const nextHead = {
        x: (game.state.snake[0].x + game.state.direction.x + game.state.gridSize) % game.state.gridSize,
        y: (game.state.snake[0].y + game.state.direction.y + game.state.gridSize) % game.state.gridSize,
      };
      game.state.food = nextHead;
      game.step();
    }

    expect(game.state.score).toBe(5);
    expect(game.state.movesPerSecond).toBeCloseTo(8);
    expect(game.state.moveDelayMs).toBeCloseTo(1000 / 8);

    game.state.status = 'game-over';
    expect(game.restart()).toBe(true);

    expect(game.state.score).toBe(0);
    expect(game.state.movesPerSecond).toBeCloseTo(7);
    expect(game.state.moveDelayMs).toBeCloseTo(1000 / 7);
  });

  it('eats food, grows, increments score, and places the next food on a free cell', () => {
    const game = createGame({
      random: () => 0,
      initialSnake: [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 },
      ],
      initialFood: { x: 11, y: 10 },
    });

    game.start();
    game.step();

    expect(game.state.score).toBe(1);
    expect(game.state.snake).toHaveLength(4);
    expect(game.state.snake[0]).toEqual({ x: 11, y: 10 });
    expect(game.state.food).not.toEqual({ x: 11, y: 10 });
    expect(game.state.snake).not.toContainEqual(game.state.food);
  });

  it('places food only on remaining free cells after growth, even on a nearly full board', () => {
    const game = createGame({
      gridSize: 3,
      random: () => 0.99,
      initialSnake: [
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
      ],
      initialFood: { x: 1, y: 2 },
      initialDirection: directions.DOWN,
    });

    game.start();
    game.step();

    expect(game.state.score).toBe(1);
    expect(game.state.snake).toHaveLength(8);
    expect(game.state.food).toEqual({ x: 0, y: 2 });
    expect(game.state.snake).not.toContainEqual(game.state.food);
  });

  it('uses null food when the snake fills the entire board', () => {
    const game = createGame({
      gridSize: 2,
      random: alwaysFirstFreeCell,
      initialSnake: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      initialFood: { x: 0, y: 1 },
      initialDirection: directions.DOWN,
    });

    game.start();
    game.step();

    expect(game.state.score).toBe(1);
    expect(game.state.snake).toHaveLength(4);
    expect(game.state.food).toBeNull();
  });

  it('ends the game on self-collision', () => {
    const game = createGame({
      random: alwaysFirstFreeCell,
      initialSnake: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 4, y: 5 },
        { x: 3, y: 5 },
      ],
      initialDirection: directions.UP,
    });

    game.start();
    game.turn(directions.LEFT);
    game.step();

    expect(game.state.status).toBe('game-over');
  });

  it('does not move or turn before the game is started', () => {
    const game = createGame({ random: alwaysFirstFreeCell });

    expect(game.turn(directions.UP)).toBe(false);
    game.step();

    expect(game.state.status).toBe('ready');
    expect(game.state.direction).toEqual(directions.RIGHT);
    expect(game.state.snake[0]).toEqual({ x: 10, y: 10 });
  });

  it('starts from the ready state and reports whether start happened', () => {
    const game = createGame({ random: alwaysFirstFreeCell });

    expect(game.start()).toBe(true);
    expect(game.state.status).toBe('playing');
    expect(game.start()).toBe(false);
  });

  it('restarts after game over with a clean initial snake, food, score, direction, and ready state', () => {
    const game = createGame({
      random: alwaysFirstFreeCell,
      initialSnake: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 4, y: 5 },
        { x: 3, y: 5 },
      ],
      initialDirection: directions.UP,
    });

    game.start();
    game.turn(directions.LEFT);
    game.step();
    expect(game.state.status).toBe('game-over');

    expect(game.restart()).toBe(true);

    expect(game.state.status).toBe('ready');
    expect(game.state.score).toBe(0);
    expect(game.state.direction).toEqual(directions.RIGHT);
    expect(game.state.snake).toEqual([
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ]);
    expect(game.state.food).toEqual({ x: 0, y: 0 });
  });

  it('provides clear status messages and action labels for start, play, and game-over screens', () => {
    expect(statusMessage({ status: 'ready', score: 0 })).toBe('Press Start or Space to play. Use Arrow Keys or WASD to steer.');
    expect(primaryActionLabel({ status: 'ready' })).toBe('Start Game');

    expect(statusMessage({ status: 'playing', score: 2 })).toBe('Playing — use Arrow Keys or WASD');
    expect(primaryActionLabel({ status: 'playing' })).toBe('Playing');

    expect(statusMessage({ status: 'game-over', score: 7 })).toBe('Game Over — Final Score 7. Press Restart or Space to play again.');
    expect(primaryActionLabel({ status: 'game-over' })).toBe('Restart Game');
  });
});

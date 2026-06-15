import { describe, expect, it } from 'vitest';
import { createGame, directions, directionFromKey, statusMessage, primaryActionLabel } from '../app.js';

const alwaysFirstFreeCell = () => 0;

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

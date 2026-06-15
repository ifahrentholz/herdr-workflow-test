import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createSnakeShellGame,
  directionFromKey,
  directions,
  isPauseKey,
  isStartKey,
} from '../snake-basic/snake.js';

const projectRoot = process.cwd();

describe('snake-basic static shell files', () => {
  it('uses separate HTML, CSS, and JavaScript files with the visible game shell', () => {
    const html = readFileSync(join(projectRoot, 'snake-basic/index.html'), 'utf8');

    expect(html).toContain('<link rel="stylesheet" href="styles.css"');
    expect(html).toContain('<script type="module" src="snake.js"');
    expect(html).toContain('<canvas');
    expect(html).toContain('data-score');
    expect(html).toContain('data-highscore');
    expect(html).toContain('data-status');
    expect(html).toContain('data-start-button');
    expect(html).toMatch(/Arrow Keys/i);
    expect(html).toMatch(/WASD/i);
    expect(html).toMatch(/Space/i);
  });
});

describe('snake-basic shell controls', () => {
  it('starts from a readable ready state with placeholder score values', () => {
    const game = createSnakeShellGame();

    expect(game.state.status).toBe('ready');
    expect(game.state.score).toBe(0);
    expect(game.state.highscore).toBe(0);
    expect(game.state.snake[0]).toEqual({ x: 10, y: 10 });
    expect(game.state.direction).toEqual(directions.RIGHT);
  });

  it('maps Enter, Space, Arrow keys, and WASD to beginner-friendly controls', () => {
    expect(isStartKey({ key: 'Enter', code: 'Enter' })).toBe(true);
    expect(isStartKey({ key: ' ', code: 'Space' })).toBe(false);
    expect(isPauseKey({ key: ' ', code: 'Space' })).toBe(true);

    expect(directionFromKey('ArrowUp')).toEqual(directions.UP);
    expect(directionFromKey('w')).toEqual(directions.UP);
    expect(directionFromKey('A')).toEqual(directions.LEFT);
    expect(directionFromKey('s')).toEqual(directions.DOWN);
    expect(directionFromKey('ArrowRight')).toEqual(directions.RIGHT);
    expect(directionFromKey('not-a-control')).toBeNull();
  });

  it('starts, moves automatically, allows turns, and blocks immediate 180-degree reversals', () => {
    const game = createSnakeShellGame();

    expect(game.start()).toBe(true);
    game.step();
    expect(game.state.snake[0]).toEqual({ x: 11, y: 10 });

    expect(game.turn(directions.LEFT)).toBe(false);
    expect(game.turn(directions.UP)).toBe(true);
    game.step();

    expect(game.state.direction).toEqual(directions.UP);
    expect(game.state.snake[0]).toEqual({ x: 11, y: 9 });
    expect(game.state.snake).toHaveLength(3);
  });

  it('pauses and resumes with Space without moving while paused', () => {
    const game = createSnakeShellGame();
    game.start();

    expect(game.togglePause()).toBe('paused');
    game.step();
    expect(game.state.snake[0]).toEqual({ x: 10, y: 10 });

    expect(game.togglePause()).toBe('playing');
    game.step();
    expect(game.state.snake[0]).toEqual({ x: 11, y: 10 });
  });
});

import { describe, expect, it } from 'vitest';
import { createGreetingMessage } from './greeting';

describe('createGreetingMessage', () => {
  it('returns the TypeScript greeting for button interactions', () => {
    expect(createGreetingMessage()).toBe('Hello from TypeScript!');
  });
});

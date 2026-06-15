export const directions = Object.freeze({
  UP: Object.freeze({ x: 0, y: -1 }),
  DOWN: Object.freeze({ x: 0, y: 1 }),
  LEFT: Object.freeze({ x: -1, y: 0 }),
  RIGHT: Object.freeze({ x: 1, y: 0 }),
});

const KEY_DIRECTIONS = new Map([
  ['ArrowUp', directions.UP],
  ['w', directions.UP],
  ['W', directions.UP],
  ['ArrowDown', directions.DOWN],
  ['s', directions.DOWN],
  ['S', directions.DOWN],
  ['ArrowLeft', directions.LEFT],
  ['a', directions.LEFT],
  ['A', directions.LEFT],
  ['ArrowRight', directions.RIGHT],
  ['d', directions.RIGHT],
  ['D', directions.RIGHT],
]);

export function directionFromKey(key) {
  return KEY_DIRECTIONS.get(key) ?? null;
}

const HIGHSCORE_KEY = 'snakeHighscore';
const START_MOVES_PER_SECOND = 7;
const MAX_MOVES_PER_SECOND = 14;
const SCORE_PER_SPEED_INCREASE = 5;

export function movesPerSecondForScore(score) {
  const safeScore = Number.isSafeInteger(score) && score > 0 ? score : 0;
  const speedIncreases = Math.floor(safeScore / SCORE_PER_SPEED_INCREASE);
  return Math.min(START_MOVES_PER_SECOND + speedIncreases, MAX_MOVES_PER_SECOND);
}

export function moveDelayMsForScore(score) {
  return 1000 / movesPerSecondForScore(score);
}

function safeBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createHighscoreStore(storage = safeBrowserStorage()) {
  return {
    load() {
      if (!storage) {
        return 0;
      }

      try {
        const storedValue = storage.getItem(HIGHSCORE_KEY);
        const parsedValue = Number(storedValue);

        if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
          return 0;
        }

        return parsedValue;
      } catch {
        return 0;
      }
    },

    save(score) {
      if (!storage || !Number.isSafeInteger(score) || score < 0) {
        return false;
      }

      try {
        storage.setItem(HIGHSCORE_KEY, String(score));
        return true;
      } catch {
        return false;
      }
    },
  };
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function isSameDirection(a, b) {
  return a.x === b.x && a.y === b.y;
}

function isOpposite(a, b) {
  return a.x + b.x === 0 && a.y + b.y === 0;
}

function cloneCells(cells) {
  return cells.map((cell) => ({ ...cell }));
}

function defaultSnake(gridSize) {
  const center = Math.floor(gridSize / 2);
  return [
    { x: center, y: center },
    { x: center - 1, y: center },
    { x: center - 2, y: center },
  ];
}

function wrap(value, gridSize) {
  return (value + gridSize) % gridSize;
}

function nextHead(head, direction, gridSize) {
  return {
    x: wrap(head.x + direction.x, gridSize),
    y: wrap(head.y + direction.y, gridSize),
  };
}

function placeFood(gridSize, snake, random) {
  const freeCells = [];

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const cell = { x, y };
      if (!snake.some((segment) => sameCell(segment, cell))) {
        freeCells.push(cell);
      }
    }
  }

  if (freeCells.length === 0) {
    return null;
  }

  const index = Math.min(Math.floor(random() * freeCells.length), freeCells.length - 1);
  return { ...freeCells[index] };
}

export function createGame(options = {}) {
  const gridSize = options.gridSize ?? 20;
  const random = options.random ?? Math.random;
  const initialSnake = cloneCells(options.initialSnake ?? defaultSnake(gridSize));
  const initialDirection = options.initialDirection ?? directions.RIGHT;
  const initialFood = options.initialFood ? { ...options.initialFood } : null;
  const highscoreStore = options.highscoreStore ?? createHighscoreStore();

  let hasQueuedTurn = false;

  const state = {
    gridSize,
    snake: [],
    direction: directions.RIGHT,
    food: null,
    score: 0,
    movesPerSecond: movesPerSecondForScore(0),
    moveDelayMs: moveDelayMsForScore(0),
    highscore: highscoreStore.load(),
    status: 'ready',
  };

  function updateSpeed() {
    state.movesPerSecond = movesPerSecondForScore(state.score);
    state.moveDelayMs = moveDelayMsForScore(state.score);
  }

  function reset({ useProvidedInitialState = false } = {}) {
    const snake = cloneCells(useProvidedInitialState ? initialSnake : defaultSnake(gridSize));
    state.snake = snake;
    state.direction = useProvidedInitialState ? initialDirection : directions.RIGHT;
    state.food = useProvidedInitialState && initialFood
      ? { ...initialFood }
      : placeFood(gridSize, snake, random);
    state.score = 0;
    updateSpeed();
    state.status = 'ready';
    hasQueuedTurn = false;
  }

  reset({ useProvidedInitialState: true });

  return {
    state,

    start() {
      if (state.status !== 'ready') {
        return false;
      }

      state.status = 'playing';
      return true;
    },

    restart() {
      if (state.status !== 'game-over') {
        return false;
      }

      reset();
      return true;
    },

    turn(nextDirection) {
      if (
        state.status !== 'playing'
        || !nextDirection
        || hasQueuedTurn
        || isOpposite(nextDirection, state.direction)
      ) {
        return false;
      }

      if (isSameDirection(nextDirection, state.direction)) {
        return false;
      }

      state.direction = nextDirection;
      hasQueuedTurn = true;
      return true;
    },

    step() {
      if (state.status !== 'playing') {
        return state;
      }

      hasQueuedTurn = false;

      const head = nextHead(state.snake[0], state.direction, gridSize);
      const isEating = state.food && sameCell(head, state.food);
      const collisionBody = isEating ? state.snake : state.snake.slice(0, -1);

      if (collisionBody.some((segment) => sameCell(segment, head))) {
        state.status = 'game-over';
        return state;
      }

      state.snake.unshift(head);

      if (isEating) {
        state.score += 1;
        updateSpeed();
        if (state.score > state.highscore) {
          state.highscore = state.score;
          highscoreStore.save(state.highscore);
        }
        state.food = placeFood(gridSize, state.snake, random);
      } else {
        state.snake.pop();
      }

      return state;
    },
  };
}

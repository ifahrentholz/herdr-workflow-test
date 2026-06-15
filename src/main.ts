import './style.css';
import { createGreetingMessage } from './greeting';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root element was not found.');
}

app.innerHTML = `
  <main class="hello-card" aria-labelledby="page-title">
    <p class="eyebrow">Vite + TypeScript</p>
    <h1 id="page-title">Hello World</h1>
    <p class="subtitle">Your Hello World webapp is running.</p>
    <p class="message" data-testid="greeting-message">Hello World</p>
    <button class="primary-button" type="button">Update greeting</button>
  </main>
`;

const message = app.querySelector<HTMLParagraphElement>('[data-testid="greeting-message"]');
const button = app.querySelector<HTMLButtonElement>('button');

button?.addEventListener('click', () => {
  if (message) {
    message.textContent = createGreetingMessage();
  }
});

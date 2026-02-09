const container = document.getElementById('toast-container');

export function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => {
    el.style.animation = 'toast-out 200ms ease-in forwards';
    el.addEventListener('animationend', () => el.remove());
  }, 3000);
}

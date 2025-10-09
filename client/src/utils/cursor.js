// Utility functions for managing custom cursor colors

export function updateCursorColor(color) {
  if (!color) return;

  const encodedColor = encodeURIComponent(color);

  // Create style element if it doesn't exist
  let styleEl = document.getElementById('custom-cursor-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'custom-cursor-styles';
    document.head.appendChild(styleEl);
  }

  // Update cursor styles with the new color
  styleEl.textContent = `
    body.custom-cursor,
    body.custom-cursor * {
      cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><text y="20" font-size="20" fill="${encodedColor}">▲</text></svg>') 12 12, auto !important;
    }

    body.custom-cursor button,
    body.custom-cursor a,
    body.custom-cursor [role="button"],
    body.custom-cursor .clickable,
    body.custom-cursor select {
      cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><text y="20" font-size="20" fill="${encodedColor}">👆</text></svg>') 12 12, pointer !important;
    }

    body.custom-cursor input[type="text"],
    body.custom-cursor input[type="password"],
    body.custom-cursor input[type="email"],
    body.custom-cursor input[type="number"],
    body.custom-cursor textarea {
      cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><text y="16" font-size="16" fill="${encodedColor}">I</text></svg>') 10 10, text !important;
    }

    body.custom-cursor button:disabled {
      cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><text y="20" font-size="20" fill="%23888">🚫</text></svg>') 12 12, not-allowed !important;
    }
  `;
}

export function enableCustomCursor() {
  document.body.classList.add('custom-cursor');
}

export function disableCustomCursor() {
  document.body.classList.remove('custom-cursor');
}

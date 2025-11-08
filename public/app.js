const form = document.getElementById('transfer-form');
const logOutput = document.getElementById('log-output');
const statusBadge = document.getElementById('session-status');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-console');
const transfersTableBody = document.querySelector('#transfers-table tbody');

const transfers = new Map();

let eventSource;

function setStatus(text, variant = 'idle') {
  statusBadge.textContent = text;
  statusBadge.dataset.variant = variant;
}

function appendLog({ level = 'info', message, timestamp = new Date().toISOString() }) {
  const entry = document.createElement('div');
  entry.className = `entry level-${level}`;

  const time = document.createElement('span');
  time.className = 'timestamp';
  const date = new Date(timestamp);
  time.textContent = date.toLocaleTimeString();

  const text = document.createElement('span');
  const safeMessage = typeof message === 'string' ? message : String(message ?? '');
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match;
  while ((match = urlRegex.exec(safeMessage)) !== null) {
    if (match.index > lastIndex) {
      text.appendChild(document.createTextNode(safeMessage.slice(lastIndex, match.index)));
    }
    const link = document.createElement('a');
    link.href = match[0];
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = match[0];
    text.appendChild(link);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < safeMessage.length) {
    text.appendChild(document.createTextNode(safeMessage.slice(lastIndex)));
  }

  entry.appendChild(time);
  entry.appendChild(text);
  logOutput.appendChild(entry);
  logOutput.scrollTop = logOutput.scrollHeight;
}

function clearLogs() {
  logOutput.innerHTML = '';
}

function formatStatus(status) {
  const labels = {
    preparing: 'Preparing',
    'forcing-failure': 'Forcing failure',
    submitted: 'Submitted',
    monitoring: 'Monitoring',
    pending: 'Pending',
    notfound: 'Not yet in mempool',
    confirmed: 'Confirmed',
    reverted: 'Reverted',
    error: 'Error',
    'invalid-batch': 'Invalid batch size',
  };
  return labels[status] || (status ? status : 'Unknown');
}

function renderTransfersTable() {
  if (!transfersTableBody) return;
  transfersTableBody.innerHTML = '';

  if (transfers.size === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'No transfers yet.';
    row.appendChild(cell);
    transfersTableBody.appendChild(row);
    return;
  }

  const rows = Array.from(transfers.values()).sort((a, b) => a.createdAt - b.createdAt);

  rows.forEach((transfer) => {
    const row = document.createElement('tr');

    const labelCell = document.createElement('td');
    labelCell.textContent = transfer.label || `Tx ${transfer.txIndex + 1}`;
    row.appendChild(labelCell);

    const hashCell = document.createElement('td');
    if (transfer.txHash) {
      const link = document.createElement('a');
      link.href = `https://etherscan.io/tx/${transfer.txHash}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = transfer.txHash;
      hashCell.appendChild(link);
    } else {
      hashCell.textContent = '—';
    }
    row.appendChild(hashCell);

    const statusCell = document.createElement('td');
    const statusPill = document.createElement('span');
    statusPill.className = `status-pill status-${transfer.status || 'unknown'}`;
    statusPill.textContent = formatStatus(transfer.status);
    statusCell.appendChild(statusPill);
    row.appendChild(statusCell);

    const updatedCell = document.createElement('td');
    const updated = transfer.updatedAt ? new Date(transfer.updatedAt) : new Date();
    updatedCell.textContent = updated.toLocaleTimeString();
    row.appendChild(updatedCell);

    transfersTableBody.appendChild(row);
  });
}

function resetTransfers() {
  transfers.clear();
  renderTransfersTable();
}

function updateTransferFromMeta(meta = {}, message, timestamp) {
  if (!meta.id) {
    return;
  }

  const existing = transfers.get(meta.id) || {
    id: meta.id,
    createdAt: Date.now(),
    txIndex: meta.txIndex,
  };

  existing.label = meta.label || existing.label;
  existing.txIndex = typeof meta.txIndex === 'number' ? meta.txIndex : existing.txIndex;
  if (meta.txHash) {
    existing.txHash = meta.txHash;
  }
  if (meta.status) {
    existing.status = meta.status;
  }
  existing.lastMessage = message || existing.lastMessage;
  existing.updatedAt = timestamp || new Date().toISOString();

  transfers.set(meta.id, existing);
  renderTransfersTable();
}

function closeEventSource() {
  if (eventSource) {
    eventSource.close();
    eventSource = undefined;
  }
}

async function submitForm(event) {
  event.preventDefault();
  closeEventSource();
  clearLogs();
  resetTransfers();
  setStatus('Sending…', 'running');
  sendButton.disabled = true;

  const formData = new FormData(form);
  const payload = {};

  for (const [key, value] of formData.entries()) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      payload[key] = trimmed;
    }
  }

  try {
    const response = await fetch('/api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      appendLog({ level: 'error', message: `Failed to start session: ${errorText}` });
      setStatus('Error', 'error');
      sendButton.disabled = false;
      return;
    }

    const { sessionId } = await response.json();
    appendLog({ level: 'info', message: `Session started. ID: ${sessionId}` });

    eventSource = new EventSource(`/api/events/${sessionId}`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        appendLog(payload);
        updateTransferFromMeta(payload.meta, payload.message, payload.timestamp);

        const status = payload.meta?.status;
        if (
          status &&
          ['preparing', 'forcing-failure', 'submitted', 'monitoring', 'pending', 'notfound'].includes(status)
        ) {
          setStatus('Running…', 'running');
        } else if (status && ['reverted', 'error', 'invalid-batch'].includes(status)) {
          setStatus('Failed', 'error');
        } else if (status === 'confirmed') {
          setStatus('Confirmed', 'idle');
        }
      } catch (error) {
        appendLog({ level: 'error', message: `Failed to parse server message: ${error.message}` });
        setStatus('Error', 'error');
      }
    };

    eventSource.addEventListener('end', () => {
      appendLog({ level: 'info', message: 'Session complete.' });
      setStatus('Idle', 'idle');
      sendButton.disabled = false;
      closeEventSource();
    });

    eventSource.onerror = () => {
      appendLog({ level: 'warn', message: 'Lost connection to server. Check the terminal for details.' });
      setStatus('Disconnected', 'error');
      sendButton.disabled = false;
      closeEventSource();
    };
  } catch (error) {
    appendLog({ level: 'error', message: `Failed to submit request: ${error.message}` });
    setStatus('Error', 'error');
    sendButton.disabled = false;
  }
}

form.addEventListener('submit', submitForm);
clearButton.addEventListener('click', () => {
  clearLogs();
  appendLog({ level: 'info', message: 'Console cleared.' });
});

appendLog({
  level: 'info',
  message:
    'Ready. Fill in the form with your mainnet configuration. Values left blank fall back to the server .env file.',
});
setStatus('Idle', 'idle');
renderTransfersTable();

# Cryptoflasher ERC20 Transfer Dashboard

This project runs a local web dashboard that helps you submit ERC20 transfers between wallets you
control on Ethereum mainnet, then watch the live status of each transaction (pending, confirmed, or
reverted). It is intended for controlled experiments with your own addresses. You can now supply the
exact gas limit used for each transfer so you can explore different outcomes — including deliberate
failures when you set the limit too low.
reverted). It is intended for controlled experiments with your own addresses. The current build
intentionally underfunds every transaction with too little gas so each transfer is mined and then
reverts, letting you study guaranteed failure behavior without adjusting settings manually.

## Prerequisites

- Node.js 18 or newer
- An Ethereum mainnet RPC URL (Infura, Alchemy, or another provider)
- A funded wallet that controls both the sender and recipient addresses
- Optional: an `.env` file for default values so you do not need to retype them in the UI each time

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file based on the provided template:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` to include your mainnet configuration. Any fields you leave blank in the dashboard
   will fall back to these defaults. Keep this file private — it may contain sensitive wallet keys.

## Running the app

1. Start the local server:
   ```bash
   npm start
   ```

2. Open your browser to [http://localhost:3000](http://localhost:3000) (or the port you configured).

3. Fill out the form:
   - **Ethereum RPC URL** – your mainnet provider endpoint.
   - **Sender Private Key** – wallet that holds the tokens (never share this key).
   - **Token Contract Address** – ERC20 contract you want to transfer.
   - **Recipient Address** – destination wallet you also control.
   - **Amount (whole units)** – the amount you wish to send. The app fetches token decimals and
     converts for you.
   - **Number of transfers** – optional batch size. Each submission replays the transfer this many
     times and monitors them concurrently.
   - **Gas price (optional)** – override the gas price used for every submitted transaction.
   - **Gas limit** – required manual gas limit for each transfer. Choose a value low enough to force
     a revert or high enough to allow success depending on the behavior you want to observe.
   - **Gas price (optional)** – you can still supply a custom gas price, but the app will override
     the gas limit to ensure the transaction fails.

4. Click **Send Transfer**. Keep the page open while the transaction processes. The live console will
   show:
   - The submitted transaction hash and a clickable Etherscan link as soon as the transaction is
     broadcast.
   - Whether the tx is pending, not yet seen in the mempool, confirmed, or reverted.
   - Revert reasons (when available) and basic receipt data such as block number and gas usage.
   - A summary table beneath the console that lists every in-flight transaction hash alongside its
     latest status so you can track multiple attempts at once.

## Safety notes

- Only use wallets and tokens that you own and control.
- Double-check token amounts and gas settings before broadcasting to mainnet.
- Store the `.env` file securely; do not commit it to version control or share it publicly.
- Selecting a gas limit that is too low will cause transactions to run out of gas and revert. Pick a
  value that matches the behavior you intend to study and budget for the gas that will be consumed.
- The dashboard now always forces a revert by capping the gas limit below the required amount. Be
  prepared for each broadcast to fail and burn the associated gas fee.

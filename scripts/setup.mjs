import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const secret = () => randomBytes(32).toString('hex');
const token = secret();
try {
  writeFileSync(new URL('../.env', import.meta.url), `DB_NAME=cryptopay\nDB_USER=cryptopay\nDB_PASSWORD=${secret()}\nJWT_SECRET=${secret()}\nENCRYPTION_KEY=${secret()}\nSETUP_TOKEN=${token}\nBIND_ADDRESS=127.0.0.1\nWEB_PORT=8080\nCOOKIE_SECURE=false\nDISABLE_POLLER=false\n`, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with unique secrets. Run docker compose up --build -d.\nOpen http://localhost:8080 and use SETUP_TOKEN from .env to create the owner account.\nKeep .env backed up securely; the encryption key is needed to restore credentials.');
} catch (error) {
  if (error.code === 'EEXIST') { console.error('.env already exists; no changes made.'); process.exitCode = 1; }
  else throw error;
}

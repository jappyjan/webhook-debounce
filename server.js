import Koa from "koa";
import bodyParser from "koa-bodyparser";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const DEBOUNCE_TIME_S = process.env.DEBOUNCE_TIME_S;
const DEBOUNCE_TIME_MS = DEBOUNCE_TIME_S * 1000;

if (!DEBOUNCE_TIME_S) {
  console.error("DEBOUNCE_TIME_S is not set");
  process.exit(1);
}

const PORT = process.env.PORT;
if (!PORT) {
  console.error("PORT is not set");
  process.exit(1);
}

const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`);
const error = (message) => console.error(`[${new Date().toISOString()}] ${message}`);

const app = new Koa();
app.use(bodyParser());

const webhooks = new Map();

async function callWebhook(url, headers, method) {
  log(`Send to: ${method} ${url}`);
  try {
    await axios(url, { headers, method });
    webhooks.delete(url);
  } catch (err) {
    error(`Failed to fetch ${url}`);
    console.error(err);
  }
}

app.use((ctx) => {
  if (ctx.method !== "GET") {
    return;
  }

  const { url, headers, method, id } = ctx.request.query;

  log(`INCOMING REQUEST: ${method} ${url}`);

  if (!url) {
    ctx.body = JSON.stringify({
      success: false,
      message: "url is required",
    });
    return;
  }

  if (!method) {
    ctx.body = JSON.stringify({
      success: false,
      message: "method is required",
    });
    return;
  }

  const requestIdentifier = id || `${method} ${url}`;

  let didSendNow = false;
  const existingCall = webhooks.get(requestIdentifier);
  if (existingCall) {
    clearTimeout(existingCall.timeout);

    if (existingCall.firstCall < Date.now() - DEBOUNCE_TIME_MS) {
      log("timeout interval reached, sending now");
      callWebhook(url, headers, method);
      didSendNow = true;
    }
  }

  const timeout = setTimeout(() => {
    callWebhook(url, headers, method);
  }, DEBOUNCE_TIME_MS);

  webhooks.set(requestIdentifier, {
    firstCall: existingCall?.firstCall || Date.now(),
    timeout,
  });
  ctx.body = JSON.stringify({
    success: true,
    message: `Sending request in ${DEBOUNCE_TIME_S}s${didSendNow ? " and just now" : ""}`,
  });
});

app.listen(PORT);
log(`Server running on port ${PORT}`);

import { DEFAULT_CONFIG } from "@shared/config";

/**
 * A small Chrome DevTools Protocol driver.
 *
 * There is no test runner or browser automation dependency here on purpose:
 * everything the app needs checking is reachable by evaluating JavaScript in a
 * headless Chromium and reading the answer back.
 *
 * Traps this encodes, each found the hard way:
 *  - `--virtual-time-budget` stalls Web Workers, so pdf.js never resolves under
 *    it. Everything below runs in real time and polls.
 *  - `pkill -f <pattern>` matches the invoking shell's own command line and
 *    kills the script running it; use `fuser -k <port>/tcp`.
 *  - The app goes fullscreen at the first key press, and while fullscreen the
 *    browser claims Escape before the app sees it. A test that presses any key
 *    must disable that setting first — see `seedSettings`.
 */

interface Target {
  webSocketDebuggerUrl: string;
}

/** Poll `fn` until it returns something truthy, or throw after `timeoutMs`. */
export async function waitFor<T>(
  what: string,
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const v = await fn();
      if (v) return v;
      last = v;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await Bun.sleep(100);
  }
  throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

export class Browser {
  private proc: Bun.Subprocess;
  private port: number;

  private constructor(proc: Bun.Subprocess, port: number) {
    this.proc = proc;
    this.port = port;
  }

  /** Launch headless Chromium with the debugging port open. */
  static async launch(port = 9222): Promise<Browser> {
    const bin =
      Bun.which("chromium") ??
      Bun.which("chromium-browser") ??
      Bun.which("google-chrome") ??
      Bun.which("google-chrome-stable");
    if (!bin) throw new Error("no chromium binary found on PATH");

    const profile = `/tmp/local-pdf-cdp-${port}-${Date.now()}`;
    const proc = Bun.spawn(
      [
        bin,
        "--headless=new",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        "--hide-scrollbars",
        "about:blank",
      ],
      { stdout: "ignore", stderr: "ignore" },
    );

    const browser = new Browser(proc, port);
    // The port is not listening the instant the process starts.
    await waitFor("chromium devtools", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`).catch(
        () => null,
      );
      return res?.ok ?? false;
    });
    return browser;
  }

  /** Open `url` in a new tab and attach to it. */
  async open(url: string): Promise<Page> {
    const res = await fetch(
      `http://127.0.0.1:${this.port}/json/new?${encodeURIComponent(url)}`,
      { method: "PUT" },
    );
    if (!res.ok) throw new Error(`could not open a tab (${res.status})`);
    const target = (await res.json()) as Target;
    return await Page.attach(target.webSocketDebuggerUrl);
  }

  close() {
    this.proc.kill();
  }
}

export class Page {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve(v: unknown): void; reject(e: Error): void }
  >();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (msg.id === undefined) return; // an event, not a reply
      const slot = this.pending.get(msg.id);
      if (!slot) return;
      this.pending.delete(msg.id);
      if (msg.error) slot.reject(new Error(msg.error.message));
      else slot.resolve(msg.result);
    });
  }

  static async attach(wsUrl: string): Promise<Page> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("ws failed")), {
        once: true,
      });
    });
    return new Page(ws);
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Evaluate an expression in the page and return its value.
   *
   * Promises are awaited, so an expression may be `(async () => …)()`.
   */
  async eval<T>(expression: string): Promise<T> {
    const res = await this.send<{
      result: { value?: T };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    }>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(d.exception?.description ?? d.text);
    }
    return res.result.value as T;
  }

  /** Press a key by its `KeyboardEvent.key` name. */
  async press(key: string, modifiers = 0) {
    const windowsVirtualKeyCode = VIRTUAL_KEYS[key];
    const base = {
      key,
      modifiers,
      ...(windowsVirtualKeyCode ? { windowsVirtualKeyCode } : {}),
      // A single-character key also needs text, or the page sees no input.
      ...(key.length === 1 ? { text: key } : {}),
    };
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  }

  /**
   * Press, move, release — a real drag.
   *
   * Chromium turns these into pointer events, which is what the app listens
   * for; dispatching synthetic PointerEvents from a script cannot be captured
   * with `setPointerCapture` and so never behaves like the real thing.
   */
  async drag(from: [number, number], to: [number, number], steps = 6) {
    const [x0, y0] = from;
    const [x1, y1] = to;
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: x0,
      y: y0,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    for (let i = 1; i <= steps; i++) {
      await this.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: x0 + ((x1 - x0) * i) / steps,
        y: y0 + ((y1 - y0) * i) / steps,
        button: "left",
        buttons: 1,
      });
    }
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: x1,
      y: y1,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  }

  async click(x: number, y: number) {
    const base = { x, y, button: "left", clickCount: 1 };
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
  }

  /** Save a screenshot; handy when a geometry assertion fails. */
  async screenshot(path: string) {
    const { data } = await this.send<{ data: string }>("Page.captureScreenshot");
    await Bun.write(path, Buffer.from(data, "base64"));
  }

  /**
   * Reload, and resolve once the new document has loaded. `Page.reload`
   * answers as soon as the navigation starts, so without the wait the next
   * check can pass against the old document, or run mid-navigation.
   */
  async reload() {
    await this.send("Page.enable");
    await this.eval(`window.__beforeReload = true`).catch(() => {});
    await this.send("Page.reload");
    await waitFor("the reloaded page", () =>
      this.eval<boolean>(`!window.__beforeReload && document.readyState === "complete"`),
    );
  }

  close() {
    this.ws.close();
  }
}

/** Keys the app uses that Chromium wants a virtual key code for. */
const VIRTUAL_KEYS: Record<string, number> = {
  Tab: 9,
  Enter: 13,
  Escape: 27,
  PageUp: 33,
  PageDown: 34,
};

/**
 * Set the reader preferences in config.json through the app's own API, from
 * inside the page (the server only answers its own origin). Everything not
 * given goes back to its default, with fullscreen off: while fullscreen, the
 * browser claims Escape before the app sees it.
 */
export async function seedSettings(page: Page, extra: Record<string, unknown> = {}) {
  const reader = { ...DEFAULT_CONFIG.reader, fullscreen: false, ...extra };
  const body = JSON.stringify(JSON.stringify({ reader }));
  await page.eval(
    `fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: ${body} })
      .then(r => { if (!r.ok) throw new Error("config PUT " + r.status); })`,
  );
}

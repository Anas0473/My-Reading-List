import assert from "node:assert/strict";
import test from "node:test";
import { keepTypingFocus } from "../src/lib/keep-typing-focus.ts";

class Target {
  listeners = new Map<string, Function[]>();
  addEventListener(type: string, fn: Function) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), fn]);
  }
  fire(type: string, event: any = {}) {
    for (const fn of this.listeners.get(type) || []) fn(event);
  }
}

function setup() {
  const doc: any = new Target();
  const win: any = new Target();
  const timers: Function[] = [];
  win.setTimeout = (fn: Function) => timers.push(fn);
  doc.body = { tagName: "BODY" };
  doc.documentElement = { tagName: "HTML" };
  doc.visibilityState = "visible";
  doc.activeElement = doc.body;
  doc.querySelector = () => null;
  const field: any = {
    tagName: "INPUT", type: "search", id: "global-book-search", isConnected: true,
    disabled: false, readOnly: false, selectionStart: 3, selectionEnd: 3, focusCalls: 0,
    closest: () => null, getClientRects: () => [{}],
    focus() { this.focusCalls++; doc.activeElement = this; },
    setSelectionRange(start: number, end: number) { this.selectionStart = start; this.selectionEnd = end; },
  };
  doc.getElementById = (id: string) => (id === field.id ? field : null);
  keepTypingFocus(doc, win);
  return { doc, win, field, timers };
}

test("puts the cursor back after leaving and returning to the tab", () => {
  const { doc, win, field } = setup();
  doc.activeElement = field;
  doc.visibilityState = "hidden";
  doc.fire("visibilitychange");
  win.fire("blur");
  doc.activeElement = doc.body;
  field.selectionStart = field.selectionEnd = 0;
  doc.visibilityState = "visible";
  doc.fire("visibilitychange");
  assert.equal(doc.activeElement, field);
  assert.equal(field.selectionStart, 3);
});

test("leaves the cursor alone when something else has it", () => {
  const { doc, win, field } = setup();
  doc.activeElement = field;
  win.fire("blur");
  const button = { tagName: "BUTTON" };
  doc.activeElement = button;
  win.fire("focus");
  assert.equal(doc.activeElement, button);
  assert.equal(field.focusCalls, 0);
});

test("does nothing if you weren't typing", () => {
  const { doc, win, field } = setup();
  doc.activeElement = { tagName: "BUTTON" };
  win.fire("blur");
  doc.activeElement = doc.body;
  win.fire("focus");
  assert.equal(field.focusCalls, 0);
});

test("stops restoring after clicking somewhere in the page", () => {
  const { doc, win, field, timers } = setup();
  doc.activeElement = field;
  win.fire("blur");
  doc.activeElement = doc.body;
  doc.fire("pointerdown");
  win.fire("focus");
  timers.forEach((fn) => fn());
  assert.equal(field.focusCalls, 0);
});

test("refinds a redrawn box by its id", () => {
  const { doc, win, field } = setup();
  doc.activeElement = field;
  win.fire("blur");
  field.isConnected = false;
  const redrawn = { ...field, isConnected: true, focusCalls: 0, focus() { this.focusCalls++; doc.activeElement = this; } };
  doc.getElementById = () => redrawn;
  doc.activeElement = doc.body;
  win.fire("focus");
  assert.equal(doc.activeElement, redrawn);
});

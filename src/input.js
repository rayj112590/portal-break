export class Input {
  constructor(target) {
    this.keys = new Set();
    this.justPressed = new Set();
    // leftPressed / rightPressed: a click since last frame, even if it was released before the frame ran
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, left: false, leftPressed: false, rightPressed: false };
    this.anyPress = false;

    addEventListener("keydown", e => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Tab"].includes(e.code)) e.preventDefault();
      // some keyboards/layouts report Shift only via e.key
      const code = e.code || (e.key === "Shift" ? "ShiftLeft" : e.key);
      if (!e.repeat) { this.justPressed.add(code); this.anyPress = true; }
      this.keys.add(code);
    });
    addEventListener("keyup", e => this.keys.delete(e.code));
    addEventListener("blur", () => { this.keys.clear(); this.mouse.left = false; });
    addEventListener("mousemove", e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    target.addEventListener("mousedown", e => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.rightPressed = true;
      this.anyPress = true;
    });
    addEventListener("mouseup", e => { if (e.button === 0) this.mouse.left = false; });
    addEventListener("contextmenu", e => e.preventDefault());
  }
  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }
  shiftPressed() { return this.pressed("ShiftLeft") || this.pressed("ShiftRight") || this.mouse.rightPressed; }
  endFrame() { this.justPressed.clear(); this.mouse.leftPressed = this.mouse.rightPressed = false; this.anyPress = false; }
}

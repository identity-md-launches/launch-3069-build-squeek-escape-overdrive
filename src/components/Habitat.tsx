import { useEffect, useRef } from "react";
export function Habitat({
  rpm,
  running,
  paused,
  reducedMotion,
}: {
  rpm: number;
  running: boolean;
  paused: boolean;
  reducedMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    values = useRef({ rpm, running, paused, reducedMotion });
  values.current = { rpm, running, paused, reducedMotion };
  useEffect(() => {
    const canvas = canvasRef.current,
      ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.imageSmoothingEnabled = false;
    let frame = 0,
      angle = 0,
      last = 0;
    const rect = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: string,
    ) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    };
    const line = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: string,
      width = 1,
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(Math.round(x1), Math.round(y1));
      ctx.lineTo(Math.round(x2), Math.round(y2));
      ctx.stroke();
    };
    const ring = (
      x: number,
      y: number,
      radius: number,
      color: string,
      width: number,
    ) => {
      ctx.beginPath();
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const px = Math.round((x + Math.cos(a) * radius) / 2) * 2,
          py = Math.round((y + Math.sin(a) * radius) / 2) * 2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    const hamster = (
      x: number,
      y: number,
      stride: boolean,
      asleep: boolean,
    ) => {
      const colors: Record<string, string> = {
        o: "#8c5534",
        t: "#dc9152",
        l: "#f8bf7e",
        c: "#ffe2ae",
        p: "#e89486",
        d: "#1b2419",
        s: "#af6c3d",
      };
      const sprite = asleep
        ? [
            "      oooooo       ",
            "    oottttttoo     ",
            "   ottttttttttoo   ",
            "  ottlllltttttto   ",
            " ottllllllllttto   ",
            "ottllllclllltltto  ",
            "ottlllccclllltlto  ",
            "otlllcccccddllto   ",
            " otllcccccccllto   ",
            "  ottllllllltoo    ",
            "   oooooooooo      ",
          ]
        : [
            "      ooo    ooo      ",
            "     ottto  ottto     ",
            "     otptoootpto      ",
            "   oottttttttttto     ",
            "  otttllllllllttto    ",
            " otttllllllllllttto   ",
            " ottlllllllddlllttto  ",
            "otttlllllllddlllttoo  ",
            "otttlllccccclllttttpo ",
            "otttllcccccccllttttoo ",
            " ottllccccccclllttto  ",
            "  ottllccccclllttto   ",
            "   ottllllllttttoo    ",
            "    oootttttoooo      ",
          ];
      for (let row = 0; row < sprite.length; row++)
        for (let col = 0; col < sprite[row].length; col++) {
          const color = colors[sprite[row][col]];
          if (color) rect(x + col * 3, y + row * 3, 3, 3, color);
        }
      if (!asleep) {
        rect(x + (stride ? 12 : 18), y + 42, 12, 5, "#f8bf7e");
        rect(x + (stride ? 39 : 33), y + 42, 12, 5, "#f8bf7e");
      }
    };
    const draw = (time: number) => {
      const v = values.current,
        still = v.paused || v.reducedMotion || document.hidden;
      const dt = last ? Math.min(time - last, 100) / 1000 : 0;
      last = time;
      if (!still && v.running) angle += dt * (v.rpm / 60) * Math.PI * 2;
      const motionTime = still ? 0 : time;
      rect(0, 0, 480, 270, "#111d17");
      // Quiet, hand-built pixel laboratory backdrop.
      for (let x = 12; x < 480; x += 24)
        for (let y = 12; y < 240; y += 24) rect(x, y, 1, 1, "#26372a");
      rect(0, 0, 480, 3, "#1a2c21");
      rect(34, 0, 2, 41, "#42583b");
      rect(11, 40, 48, 5, "#334932");
      rect(18, 45, 34, 4, "#d3e3a4");
      rect(14, 51, 42, 2, "#263c28");
      rect(411, 0, 2, 50, "#42583b");
      rect(390, 49, 43, 5, "#334932");
      rect(396, 54, 31, 4, "#d3e3a4");
      rect(0, 226, 480, 44, "#142319");
      rect(0, 226, 480, 2, "#365036");
      for (let i = 0; i < 60; i++) {
        const x = (i * 41) % 480,
          y = 232 + ((i * 19) % 34);
        rect(x, y, (i % 3) + 1, 1, "#2f4631");
      }
      // Workstation and a cable leading to the wheel.
      rect(37, 129, 79, 57, "#0a130f");
      rect(40, 132, 73, 49, "#324933");
      rect(44, 136, 65, 40, "#172b20");
      rect(47, 139, 59, 33, "#203d27");
      for (let i = 0; i < 10; i++) {
        const h = v.running
          ? 3 + ((i * 7 + Math.floor(motionTime / 350)) % 20)
          : 2;
        rect(51 + i * 5, 166 - h, 3, h, i > 7 ? "#c3f85c" : "#80a15c");
      }
      rect(68, 186, 14, 8, "#40543a");
      rect(55, 194, 39, 4, "#5b6d45");
      rect(29, 202, 95, 7, "#3e5037");
      rect(34, 209, 5, 17, "#2a3d2a");
      rect(112, 209, 5, 17, "#2a3d2a");
      line(124, 204, 149, 204, "#5e7447", 2);
      line(149, 204, 149, 223, "#5e7447", 2);
      line(149, 223, 236, 223, "#5e7447", 2);
      // Support, outer wheel and RPM-driven spokes.
      line(269, 137, 240, 225, "#526949", 6);
      line(269, 137, 299, 225, "#526949", 6);
      rect(230, 222, 80, 5, "#829161");
      ring(269, 127, 90, "#263e2b", 12);
      ring(269, 127, 88, "#a2bb70", 3);
      ring(269, 127, 82, "#597747", 3);
      for (let i = 0; i < 12; i++) {
        const a = angle + (i / 12) * Math.PI * 2;
        line(
          269,
          127,
          269 + Math.cos(a) * 80,
          127 + Math.sin(a) * 80,
          "#345234",
          2,
        );
      }
      for (let i = 0; i < 48; i++) {
        const a = angle + (i / 48) * Math.PI * 2;
        const x = 269 + Math.cos(a) * 85,
          y = 127 + Math.sin(a) * 85;
        rect(x, y, 3, 3, i % 4 === 0 ? "#d1dd9d" : "#6f8d4c");
      }
      rect(264, 122, 10, 10, "#9db773");
      rect(267, 125, 4, 4, "#dce6ba");
      // Squeektoshi stays planted while the wheel turns underneath.
      const bounce =
        v.running && !still
          ? Math.floor(
              Math.sin(time / Math.max(60, 10000 / Math.max(1, v.rpm))) * 1.5,
            )
          : 0;
      hamster(
        v.running ? 237 : 240,
        v.running ? 163 + bounce : 177,
        Math.floor(motionTime / 110) % 2 === 0,
        !v.running,
      );
      if (!v.running) {
        ctx.fillStyle = "#b9c89b";
        ctx.font = "10px monospace";
        const phase = Math.floor(motionTime / 800) % 3;
        ctx.fillText("z", 299, 176 - phase * 3);
        ctx.font = "13px monospace";
        ctx.fillText("z", 311, 163 - phase * 3);
      }
      // Food bowl and leafy plant.
      rect(374, 212, 34, 10, "#93683f");
      rect(378, 222, 26, 4, "#614a31");
      rect(377, 209, 28, 4, "#d1b574");
      rect(384, 207, 5, 3, "#e3c58d");
      rect(395, 207, 4, 3, "#e3c58d");
      rect(434, 201, 23, 24, "#495a37");
      rect(431, 198, 29, 5, "#617746");
      line(445, 198, 445, 162, "#71834d", 2);
      [
        [436, 165],
        [443, 153],
        [452, 172],
        [431, 183],
        [450, 186],
      ].forEach(([x, y], i) => {
        rect(x, y, i % 2 ? 8 : 10, 5, "#557848");
        rect(x + 2, y - 3, 6, 3, "#7d9b58");
        line(x + 5, y + 5, 445, 197, "#456440", 1);
      });
      // An unlit wall battery becomes active with the running wheel.
      rect(380, 110, 43, 20, "#344b33");
      rect(423, 116, 4, 8, "#5b7444");
      rect(383, 113, 37, 14, "#14271c");
      for (let i = 0; i < 5; i++)
        rect(
          386 + i * 6,
          116,
          4,
          8,
          v.running && i < Math.ceil(v.rpm / 16) ? "#b3e560" : "#344a31",
        );
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <canvas
      ref={canvasRef}
      width="480"
      height="270"
      className="habitat-canvas"
      role="img"
      aria-label={`Pixel-art Squeektoshi ${running ? `running at ${rpm.toFixed(1)} RPM in a rotating hamster wheel` : "sleeping in a still hamster wheel"}. Animation ${paused || reducedMotion ? "paused" : "enabled"}.`}
    />
  );
}

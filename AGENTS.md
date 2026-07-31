# XiaoHuang Chemistry Laboratory

Treat `server/data/` as user data. Treat `dist/`, `server/public/`, `.electron-stage/`, `dist-electron/`, `dist-exe/`, and dependency folders as generated or runtime paths unless the task explicitly targets them. Do not include them in source changes.

Agent tooling under `.grok/`, `.github/workflows/`, and `skills/` is local/private and is not part of the published application source.

## Learned User Preferences

- For the 试管 / Chemist lab bench, insist on pixel-perfect 1:1 visual replica of the Chemist reference app; reject side panels, cards, and other chrome not in the video.
- Do not use simple line-drawn placeholders for glassware; prefer realistic layered assets (3D model → fixed-camera render → Pixi sprites).
- Prefer visual fidelity, fine reaction animation, and generous particle effects over performance optimization for lab visuals.
- Lab materials should match real chemistry appearance (e.g. sodium is gray-white; solids need texture and edges).
- Accepted PixiJS 8 as the primary renderer for the 2.5D interactive lab bench rather than Three.js for that surface.
- When not locked to a 1:1 replica brief, creative visual judgment is welcome if the result looks better.

## Learned Workspace Facts

- GitHub origin is `https://github.com/xingyingyuzhui/XiaoHuang-s-Chemistry-Laboratory.git`.
- Local dev: Vite frontend on port 5173 with `/api` proxied to Express on port 3000.
- Chemist 1:1 reference: full-app video `https://www.youtube.com/watch?v=J0ffIBhzgA4`; sodium/water reaction reference `https://www.youtube.com/watch?v=xOJE0ON0IJc`.
- Sibling multisubject project based on this lab lives at `/Users/qin/Desktop/小黄的教室` (follow-on work moved there).
- After structure cleanup, `src/battle/` is the preferred layered-module exemplar for new feature packaging.

export const css = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; }
.aw {
  --bg: #0a0a0a;
  --bg-2: #141414;
  --bg-3: #1d1d1d;
  --bg-hover: #222;
  --bg-sel: #1f2d44;
  --border: #2a2a2a;
  --text: #ededed;
  --muted: #8f8f8f;
  --accent: #3b82f6;
  --green: #4ade80;
  --blue: #60a5fa;
  --orange: #fb923c;
  --red: #f87171;
  --yellow: #facc15;
  --purple: #c084fc;
  --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text);
}

/* ---------- floating button ---------- */
.fab {
  position: fixed;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px 0 10px;
  border-radius: 999px;
  border: 1px solid #333;
  background: rgba(10, 10, 10, 0.92);
  backdrop-filter: blur(8px);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.fab:hover { transform: translateY(-1px); border-color: #555; }
.fab svg { width: 16px; height: 16px; }
.fab .count { font-variant-numeric: tabular-nums; }
.fab .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--red); }
.fab .dot.pending { background: var(--yellow); animation: pulse 1s infinite; }
@keyframes pulse { 50% { opacity: 0.3; } }

.pos-bottom-right { right: 16px; bottom: 16px; }
.pos-bottom-left { left: 16px; bottom: 16px; }
.pos-top-right { right: 16px; top: 16px; }
.pos-top-left { left: 16px; top: 16px; }

/* ---------- panel ---------- */
.panel {
  position: fixed;
  z-index: 2147483647;
  width: min(1040px, calc(100vw - 32px));
  height: min(620px, calc(100vh - 88px));
  min-width: 420px;
  min-height: 260px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid #333;
  border-radius: 12px;
  overflow: hidden;
  resize: both;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}
.panel.pos-bottom-right { right: 16px; bottom: 64px; }
.panel.pos-bottom-left { left: 16px; bottom: 64px; }
.panel.pos-top-right { right: 16px; top: 64px; }
.panel.pos-top-left { left: 16px; top: 64px; }

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
  flex-wrap: wrap;
}
.title { font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 6px; margin-right: 6px; }
.title svg { width: 15px; height: 15px; color: var(--accent); }
.spacer { flex: 1; }

.tabs { display: flex; gap: 2px; background: var(--bg); padding: 2px; border-radius: 8px; border: 1px solid var(--border); }
.tab {
  border: 0; background: transparent; color: var(--muted); font: inherit; font-weight: 500;
  padding: 4px 10px; border-radius: 6px; cursor: pointer; display: flex; gap: 6px; align-items: center;
}
.tab:hover { color: var(--text); }
.tab.active { background: var(--bg-3); color: var(--text); }
.tab .n { font-size: 10px; padding: 0 5px; border-radius: 999px; background: #2b2b2b; color: var(--muted); font-variant-numeric: tabular-nums; }

.subtabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); padding: 0 6px; background: var(--bg-2); overflow-x: auto; flex-shrink: 0; }
.subtab {
  border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--muted);
  font: inherit; padding: 6px 10px; cursor: pointer; white-space: nowrap;
}
.subtab:hover { color: var(--text); }
.subtab.active { color: var(--text); border-bottom-color: var(--accent); }

input.search {
  background: var(--bg); border: 1px solid var(--border); color: var(--text); font: inherit;
  border-radius: 6px; padding: 4px 8px; width: 180px; outline: none;
}
input.search:focus { border-color: var(--accent); }
label.check { display: flex; gap: 4px; align-items: center; color: var(--muted); cursor: pointer; user-select: none; white-space: nowrap; }
label.check input { margin: 0; accent-color: var(--accent); }
select.filter {
  background: var(--bg); border: 1px solid var(--border); color: var(--text); font: inherit; border-radius: 6px; padding: 3px 4px;
}

.btn {
  border: 1px solid var(--border); background: var(--bg-3); color: var(--text); font: inherit;
  padding: 3px 8px; border-radius: 6px; cursor: pointer; white-space: nowrap;
}
.btn:hover { background: var(--bg-hover); border-color: #3a3a3a; }
.btn.ghost { background: transparent; border-color: transparent; color: var(--muted); }
.btn.ghost:hover { color: var(--text); background: var(--bg-3); }
.icon-btn { width: 24px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1; }

.body { flex: 1; display: flex; min-height: 0; }
.list { flex: 1; min-width: 0; overflow: auto; }
.list.narrow { flex: 0 0 34%; max-width: 360px; border-right: 1px solid var(--border); }
.detail { flex: 1; min-width: 0; display: flex; flex-direction: column; }

/* ---------- tables ---------- */
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th {
  position: sticky; top: 0; z-index: 1; text-align: left; font-weight: 500; color: var(--muted);
  background: var(--bg-2); border-bottom: 1px solid var(--border); padding: 5px 8px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
td { padding: 4px 8px; border-bottom: 1px solid #191919; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
tbody tr { cursor: pointer; }
tbody tr:nth-child(even) { background: #0e0e0e; }
tbody tr:hover { background: var(--bg-hover); }
tbody tr.selected { background: var(--bg-sel); }
tr.failed td.name { color: var(--red); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
td.name .path { font-weight: 500; }
td.name .q { color: var(--muted); }
td.name .host { color: var(--muted); font-size: 10px; display: block; overflow: hidden; text-overflow: ellipsis; }
.mono { font-family: var(--mono); font-size: 11.5px; }
.muted { color: var(--muted); }

.method { font-family: var(--mono); font-weight: 700; font-size: 10.5px; }
.m-GET { color: var(--green); }
.m-POST { color: var(--blue); }
.m-PUT, .m-PATCH { color: var(--orange); }
.m-DELETE { color: var(--red); }
.m-OPTIONS, .m-HEAD { color: var(--purple); }

.status { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.s-2 { color: var(--green); }
.s-3 { color: var(--blue); }
.s-4 { color: var(--orange); }
.s-5, .s-err { color: var(--red); }
.s-pending { color: var(--yellow); }

.pill { display: inline-block; font-size: 10px; padding: 0 5px; border-radius: 4px; background: #262626; color: var(--muted); margin-left: 4px; vertical-align: 1px; }
.pill.server { background: #3b1d5c; color: #d8b4fe; }
.btn:disabled { opacity: 0.4; cursor: default; }
.count-pill { display: inline-block; min-width: 26px; text-align: center; padding: 1px 6px; border-radius: 999px; background: #1e3a8a55; color: #93c5fd; font-weight: 600; }

.empty { padding: 48px 16px; text-align: center; color: var(--muted); }
.empty b { color: var(--text); display: block; margin-bottom: 4px; font-size: 13px; }

.footer {
  display: flex; gap: 14px; padding: 5px 10px; border-top: 1px solid var(--border); background: var(--bg-2);
  color: var(--muted); font-variant-numeric: tabular-nums; flex-shrink: 0; flex-wrap: wrap;
}
.footer b { color: var(--text); font-weight: 500; }
.footer b.s-2 { color: var(--green); }
.footer b.s-4 { color: var(--orange); }
.footer b.s-err { color: var(--red); }
.footer b.s-pending { color: var(--yellow); }
.footer b.muted { color: var(--muted); }

.breadcrumb { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); background: var(--bg-2); }

/* ---------- detail ---------- */
.detail-head { display: flex; align-items: center; border-bottom: 1px solid var(--border); background: var(--bg-2); }
.detail-head .subtabs { border-bottom: 0; flex: 1; }
.detail-body { flex: 1; overflow: auto; padding: 8px 12px 16px; }
.section { margin-bottom: 12px; }
.section-title {
  display: flex; align-items: center; gap: 6px; font-weight: 600; padding: 6px 0; cursor: pointer; user-select: none;
  border-bottom: 1px solid var(--border); margin-bottom: 6px;
}
.section-title .caret { color: var(--muted); width: 10px; }
.section-title .extra { margin-left: auto; font-weight: 400; }
.kv { display: grid; grid-template-columns: minmax(120px, max-content) 1fr; gap: 3px 16px; font-family: var(--mono); font-size: 11.5px; }
.kv .k { color: #a5b4fc; white-space: nowrap; }
.kv .v { word-break: break-all; white-space: pre-wrap; }
.note { color: var(--muted); font-size: 11px; margin: 4px 0 8px; display: flex; gap: 6px; }
.note::before { content: '⚠'; color: var(--yellow); }
.toolbar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }

pre.code {
  margin: 0; font-family: var(--mono); font-size: 11.5px; white-space: pre-wrap; word-break: break-all;
  background: var(--bg-2); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px;
}

.json { font-family: var(--mono); font-size: 11.5px; }
.json .row { padding-left: 14px; position: relative; white-space: pre-wrap; word-break: break-all; }
.json .toggle { position: absolute; left: 0; cursor: pointer; color: var(--muted); user-select: none; width: 12px; }
.json .key { color: #a5b4fc; }
.json .str { color: #fca5a5; }
.json .num { color: #93c5fd; }
.json .bool { color: #c4b5fd; }
.json .null { color: var(--muted); }
.json .summary { color: var(--muted); cursor: pointer; }

.timing { display: grid; grid-template-columns: 150px 1fr 80px; gap: 6px 10px; align-items: center; }
.timing .label { color: var(--muted); }
.timing .track { height: 10px; position: relative; background: var(--bg-2); border-radius: 2px; }
.timing .bar { position: absolute; top: 0; bottom: 0; border-radius: 2px; min-width: 1px; }
.timing .val { text-align: right; font-variant-numeric: tabular-nums; }
.timing .group { grid-column: 1 / -1; color: var(--muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 6px; }
.timing .total { font-weight: 600; }

.toast {
  position: fixed; z-index: 2147483647; left: 50%; bottom: 24px; transform: translateX(-50%);
  background: #222; color: var(--text); padding: 6px 12px; border-radius: 6px; border: 1px solid #333;
}

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; border: 2px solid var(--bg); }
::-webkit-scrollbar-track { background: transparent; }
`;

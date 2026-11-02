window.__ModuleLoader__.load({
  id: "dsh-memory-neural-map",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    "use strict";
    let react = require("react");
    let { jsx: _jsx, jsxs: _jsxs } = require("react/jsx-runtime");

    function BrainPanelIcon({ size }) {
      return _jsx("svg", {
        "data-dsh-panel-entry": "memory-brain",
        viewBox: "0 0 16 16",
        width: size, height: size,
        fill: "none", stroke: "currentColor", strokeWidth: "1.3",
        strokeLinecap: "round", strokeLinejoin: "round",
        "aria-hidden": "true",
        children: [
          // 大脑轮廓
          _jsx("path", { d: "M8 3.2c-1-.9-2.6-.7-3.3.4-1.2.1-2 1.2-1.8 2.3-.8.7-.8 2 0 2.7-.3 1.2.6 2.3 1.8 2.3.4 1.1 1.8 1.5 2.8.8" }),
          _jsx("path", { d: "M8 3.2c1-.9 2.6-.7 3.3.4 1.2.1 2 1.2 1.8 2.3.8.7.8 2 0 2.7.3 1.2-.6 2.3-1.8 2.3-.4 1.1-1.8 1.5-2.8.8" }),
          _jsx("path", { d: "M8 3.2v8.6" }),
          // 神经节点连线
          _jsx("circle", { cx: "5.6", cy: "6.4", r: ".7", fill: "currentColor", stroke: "none" }),
          _jsx("circle", { cx: "10.4", cy: "6.4", r: ".7", fill: "currentColor", stroke: "none" }),
          _jsx("circle", { cx: "8", cy: "9.4", r: ".7", fill: "currentColor", stroke: "none" }),
          _jsx("path", { d: "M5.6 6.4 8 9.4 10.4 6.4", opacity: ".7" }),
        ],
      });
    }

    function MemoryBrainPage() {
      const url = "/memory-brain/";
      const [reloadKey, setReloadKey] = react.useState(0);
      const frameRef = react.useRef(null);
      /* 4.1 完整网页（复制链接）：优先 window.open，被拦截自动复制+弹窗提示；无宿主桥接口。
         实际逻辑在 iframe 页面内的 window.openFullWebPage（带 hash 状态），此处代理调用。 */
      const openExternal = () => {
        try {
          const fn = frameRef.current && frameRef.current.contentWindow && frameRef.current.contentWindow.openFullWebPage;
          if (typeof fn === "function") { fn(); return; }
        } catch { /* 跨源或页面未就绪 */ }
        // 降级：父页面自己走同一套（ext-url → open → 右下角气泡，不弹确认框）
        (async () => {
          const note = (msg) => {
            let el = document.getElementById("mb-corner-note");
            if (!el) {
              el = document.createElement("div");
              el.id = "mb-corner-note";
              el.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:9999;max-width:430px;background:rgba(10,16,34,.92);border:1px solid #57d8ff;border-radius:10px;padding:10px 14px;font-size:12px;color:#cdd9f2;box-shadow:0 6px 24px rgba(0,0,0,.55);white-space:pre-wrap;word-break:break-all;display:none";
              document.body.appendChild(el);
            }
            el.textContent = msg; el.style.display = "block";
            clearTimeout(el._t); el._t = setTimeout(() => { el.style.display = "none" }, 7000);
          };
          try {
            const json = await fetch("/memory-brain/api/ext-url").then(r => r.json());
            const targetUrl = json.origin + "/memory-brain/";
            const w = window.open(targetUrl, "_blank");
            await new Promise(r => setTimeout(r, 300));
            if (w && !w.closed) { note("已在新标签页打开完整网页 🧠"); return; }
            try { await navigator.clipboard.writeText(targetUrl) } catch { /* 失焦无妨 */ }
            note("已交给系统浏览器打开（若未见标签页，链接已复制）：\n" + targetUrl);
          } catch (err) { console.error(err); note("获取/复制链接失败：" + (err && err.message || err)); }
        })();
      };
      const barStyle = {
        display: "flex", gap: "6px", alignItems: "center",
        padding: "6px 10px", borderBottom: "1px solid rgba(128,128,160,.25)",
        fontSize: "12px", opacity: .9,
      };
      const btnStyle = {
        cursor: "pointer", border: "1px solid rgba(128,128,160,.4)", borderRadius: "6px",
        background: "transparent", color: "inherit", padding: "2px 10px", fontSize: "12px",
      };
      return _jsx("div", {
        "data-dsh-plugin": "memory-brain",
        style: { display: "flex", flexDirection: "column", height: "100%", width: "100%", minWidth: 0, minHeight: 0 },
        children: [
          _jsxs("div", {
            style: barStyle,
            children: [
              _jsx("span", { style: { fontWeight: 600, letterSpacing: "1px" }, children: "🧠 记忆星脑" }),
              _jsx("span", { style: { opacity: .55 }, children: "meow-memory 3D 记忆面板" }),
              _jsx("span", { style: { flex: 1 } }),
              _jsx("button", { style: btnStyle, title: "重新加载", onClick: () => setReloadKey(k => k + 1), children: "↻" }),
              _jsx("button", {
                style: btnStyle, title: "优先新标签页打开完整网页；被拦截则自动复制链接并提示",
                onClick: openExternal,
                children: "⧉ 完整网页（复制链接）",
              }),
            ],
          }),
          _jsx("iframe", {
            ref: frameRef,
            key: reloadKey,
            title: "记忆星脑",
            src: url,
            style: { flex: 1, width: "100%", border: "none", minHeight: 0, background: "#04060f" },
          }),
        ],
      });
    }

    function apply(ctx) {
      const slots = ctx.slots;
      if (!slots || typeof slots.inject !== "function") {
        console.warn("[dsh-memory-neural-map] slots 服务不可用，侧栏入口未挂载");
        return;
      }
      const disposers = [];
      try {
        disposers.push(slots.inject("sidebar.panellist", () => slots.register({
          name: "sidebar.panellist",
          id: "memory-brain",
          order: 460,
          label: () => "记忆星脑",
        }, BrainPanelIcon)));
        disposers.push(slots.inject("main", () => slots.register({
          name: "main",
          key: "memory-brain",
          inject: () => ({}),
        }, MemoryBrainPage)));
        console.info("[dsh-memory-neural-map] sidebar entry + embedded page registered");
      } catch (e) {
        console.warn("[dsh-memory-neural-map] panel registration failed:", e);
      }
      if (typeof ctx.effect === "function") {
        ctx.effect(() => () => {
          for (const d of disposers.splice(0)) { try { d() } catch { /* noop */ } }
        }, "dsh-memory-neural-map: ui mounts");
      }
    }

    const inject = ["slots"];

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});

/**
 * The page inside the live class frame: Zoom's web client (Meeting SDK client view) loaded from Zoom's
 * own servers. It runs in a frame so its React and styles stay apart from the site's.
 */

/** Pinned so a new Zoom release is tried before members get it. */
export const ZOOM_SDK_VERSION = "6.5.0"

const VENDOR = ["react", "react-dom", "redux", "redux-thunk", "react-redux", "lodash"]

export interface FrameJoin {
  signature: string
  meetingNumber: string
  passWord: string
  userName: string
  userEmail: string
}

/** JSON that is safe inside a <script> element: no "</script>" can end it early. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c")

export function zoomFrameHtml(join: FrameJoin, leaveUrl: string): string {
  const base = `https://source.zoom.us/${ZOOM_SDK_VERSION}`
  const scripts = [
    ...VENDOR.map((name) => `${base}/lib/vendor/${name}.min.js`),
    `https://source.zoom.us/zoom-meeting-${ZOOM_SDK_VERSION}.min.js`,
  ]
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Live class</title>
<style>
html, body { margin: 0; height: 100%; background: #000; }
#status { position: fixed; inset: 0; z-index: 2147483647; display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; padding: 24px; text-align: center; color: #f5f5f7; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
#status small { color: #a1a1a6; font-size: 13px; }
</style>
</head>
<body>
<div id="status" role="status"><span>Connecting to the class...</span></div>
${scripts.map((src) => `<script src="${src}"></script>`).join("\n")}
<script id="join" type="application/json">${scriptJson(join)}</script>
<script>
(function () {
  var status = document.getElementById("status");
  function show(text, detail) {
    status.innerHTML = "";
    var main = document.createElement("span");
    main.textContent = text;
    status.appendChild(main);
    var small = document.createElement("small");
    small.textContent = detail;
    status.appendChild(small);
    status.style.display = "flex";
  }
  var hint = "Reload the page, or open the class in the Zoom app.";
  if (!window.ZoomMtg) {
    show("The class could not load.", "Check your connection, then " + hint.charAt(0).toLowerCase() + hint.slice(1));
    return;
  }
  var join = JSON.parse(document.getElementById("join").textContent);
  ZoomMtg.preLoadWasm();
  ZoomMtg.prepareWebSDK();
  ZoomMtg.init({
    leaveUrl: ${scriptJson(leaveUrl)},
    patchJsMedia: true,
    leaveOnPageUnload: true,
    success: function () {
      status.style.display = "none";
      // Zoom shows its own message (with Retry) when joining fails.
      ZoomMtg.join({
        signature: join.signature,
        meetingNumber: join.meetingNumber,
        passWord: join.passWord,
        userName: join.userName,
        userEmail: join.userEmail
      });
    },
    error: function (e) { show((e && e.errorMessage) || "The class could not start.", hint); }
  });
})();
</script>
</body>
</html>
`
}

/** Where Zoom sends the frame when a member leaves: the whole page goes back to the Classroom. */
export function zoomLeftHtml(target: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Left the class</title></head>
<body style="background:#1c1c1e">
<script>
(function () {
  var target = ${scriptJson(target)};
  if (window.top && window.top !== window.self) window.top.location.href = target;
  else window.location.replace(target);
})();
</script>
</body>
</html>
`
}

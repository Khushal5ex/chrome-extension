const i="truvideo-jira-action",r="truvideo-jira-panel",c="truvideo-jira-backdrop",m="truvideo-jira-style",g="Attach Recorder Videos",p="Close Recorder",v=/([A-Z][A-Z0-9]+-\d+)/i,E=e=>`${e.issueKey}|${e.issueUrl}|${e.issueTitle}`,w=()=>{const e=window.location.href.match(v);return e?e[1].toUpperCase():""},T=()=>{const e=['[data-testid="issue.views.issue-base.foundation.summary.heading"]','[data-test-id="issue.views.issue-base.foundation.summary.heading"]','[data-testid="issue.views.issue-base.foundation.summary.heading-container"] h1','h1[data-testid="issue.views.issue-base.foundation.summary.heading"]'];for(const t of e){const s=document.querySelector(t);if(s?.textContent)return s.textContent.trim()}return document.title.replace(" - Jira","").trim()||"Jira issue"},U=()=>{const e=w();return e?{issueKey:e,issueUrl:window.location.href,issueTitle:T()}:null},I=async e=>{if(globalThis.chrome?.runtime?.sendMessage)try{await globalThis.chrome.runtime.sendMessage({type:"jira:store-context",payload:e})}catch{}},b=(()=>{try{return globalThis.chrome?.runtime?.getURL("index.html")??null}catch{return null}})(),h=e=>{if(!b)return null;const n=new URL(b);return n.searchParams.set("embedded","1"),n.searchParams.set("issueKey",e.issueKey),n.searchParams.set("issueUrl",e.issueUrl),n.searchParams.set("issueTitle",e.issueTitle),n.toString()},y=()=>{if(document.getElementById(m))return;const e=document.createElement("style");e.id=m,e.textContent=`
    #${i} {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483647;
      border: none;
      border-radius: 999px;
      padding: 12px 18px;
      background: linear-gradient(135deg, #0f1b2d, #1f3a5f);
      color: #f8f9ff;
      font-family: "Segoe UI Variable", "SF Pro Text", "Segoe UI", sans-serif;
      font-size: 13px;
      letter-spacing: 0.02em;
      box-shadow: 0 16px 28px rgba(15, 27, 45, 0.35);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #${i}:hover {
      transform: translateY(-1px);
    }
    #${c} {
      position: fixed;
      inset: 0;
      background: rgba(10, 18, 32, 0.35);
      z-index: 2147483646;
    }
    #${r} {
      position: fixed;
      right: 20px;
      bottom: 80px;
      width: min(460px, calc(100vw - 24px));
      height: min(760px, calc(100vh - 96px));
      background: #f8f9ff;
      border-radius: 18px;
      box-shadow: 0 28px 60px rgba(10, 18, 32, 0.35);
      overflow: hidden;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
    }
    #${r} .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: #0f1b2d;
      color: #f8f9ff;
      font-family: "Segoe UI Variable", "SF Pro Text", "Segoe UI", sans-serif;
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    #${r} .panel-close {
      border: none;
      background: rgba(248, 249, 255, 0.15);
      color: #f8f9ff;
      border-radius: 999px;
      padding: 4px 10px;
      cursor: pointer;
      font-size: 11px;
    }
    #${r} iframe {
      border: 0;
      width: 100%;
      height: 100%;
      background: transparent;
    }
  `,document.head.appendChild(e)},a=()=>{document.getElementById(r)?.remove(),document.getElementById(c)?.remove();const e=document.getElementById(i);e&&(e.textContent=g,e.setAttribute("aria-expanded","false"))},C=e=>{y();const n=h(e),t=document.getElementById(r);if(t){const f=t.querySelector("iframe");f&&n&&f.setAttribute("src",n);const l=document.getElementById(i);l&&(l.textContent=p,l.setAttribute("aria-expanded","true"));return}const s=document.createElement("div");s.id=c,s.addEventListener("click",a);const o=document.createElement("div");o.id=r,o.innerHTML=`
    <div class="panel-header">
      TruVideo Recorder
      <button class="panel-close" type="button">Close</button>
    </div>
    ${n?`<iframe src="${n}" title="TruVideo Recorder"></iframe>`:`<div style="padding:16px;font-family:'Segoe UI',sans-serif;font-size:13px;color:#0f1b2d;">
            Extension context not available. Reload this Jira tab after reloading the extension.
          </div>`}
  `,o.querySelector(".panel-close")?.addEventListener("click",a),document.body.appendChild(s),document.body.appendChild(o);const d=document.getElementById(i);d&&(d.textContent=p,d.setAttribute("aria-expanded","true"))},B=e=>{const n=document.getElementById(r);if(!n)return;const t=n.querySelector("iframe");if(!t)return;const s=h(e);s&&t.getAttribute("src")!==s&&t.setAttribute("src",s)},S=e=>{y();const n=document.getElementById(i),t=n??document.createElement("button");n||(t.id=i,t.type="button",t.textContent=g,t.setAttribute("aria-expanded","false"),document.body.appendChild(t)),t.dataset.issueKey=e.issueKey,t.dataset.issueUrl=e.issueUrl,t.dataset.issueTitle=e.issueTitle,t.onclick=()=>{if(document.getElementById(r)){a();return}const s={issueKey:t.dataset.issueKey??e.issueKey,issueUrl:t.dataset.issueUrl??e.issueUrl,issueTitle:t.dataset.issueTitle??e.issueTitle};C(s)}},A=()=>{document.getElementById(i)?.remove(),a()};let u=null;const x=async()=>{const e=U();if(!e){u=null,A();return}S(e),B(e);const n=E(e);n!==u&&(u=n,await I(e))},L=()=>{let e=null;const n=()=>{e===null&&(e=window.setTimeout(()=>{e=null,x()},150))};x();let t=window.location.href;setInterval(()=>{window.location.href!==t&&(t=window.location.href,n())},1e3),new MutationObserver(()=>{n()}).observe(document.body,{childList:!0,subtree:!0})};L();

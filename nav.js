// Page transition: fade in on load
document.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => document.body.classList.add("page-ready"));
});

// Page transition: fade out before navigating
document.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a || !a.href) return;
  if (a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  if (url.pathname === location.pathname && url.hash) return; // anchor links
  e.preventDefault();
  document.body.classList.remove("page-ready");
  setTimeout(() => { location.href = a.href; }, 175);
});

document.addEventListener("DOMContentLoaded", () => {
  const navHTML = `
  <nav id="navbar">
    <div class="nav-left">
      <ul>
        <li><a class="nav-link" href="/news.html">news</a></li>
      </ul>
    </div>
    <div class="separator" id="left-sep"></div>
    <a href="/index.html" class="nav-title-link" aria-label="Home">
      <h1 id="title">WHO OWNS<br>THE <span style="color: var(--red1)">FLAVOR?</span></h1>
    </a>
    <div class="separator" id="right-sep"></div>
    <div class="nav-right">
      <ul>
        <li><a class="nav-link" href="/about.html">about</a></li>
      </ul>
    </div>
  </nav>`;

  document.body.insertAdjacentHTML('afterbegin', navHTML);

  const nav = document.getElementById("navbar");
  const title = document.getElementById("title");
  const leftSep = document.getElementById("left-sep");
  const rightSep = document.getElementById("right-sep");
  const FULL_TITLE = `WHO OWNS<br>THE <span style="color: var(--red1)">FLAVOR?</span>`;
  const COLLAPSE_Y = 10;
  let scrolled = false;

  const isIndex = window.location.pathname === "/" || window.location.pathname.endsWith("index.html");
  if (isIndex) return;

  window.addEventListener("scroll", () => {
    const shouldCollapse = window.scrollY > COLLAPSE_Y;
    if (shouldCollapse && !scrolled) {
      scrolled = true;
      nav.classList.add("scrolled");
      leftSep.classList.add("hidden");
      rightSep.classList.add("hidden");
      title.classList.add("fade");
      setTimeout(() => {
        title.innerHTML = "";
        title.classList.add("shrunk");
      }, 100);
    } else if (!shouldCollapse && scrolled) {
      scrolled = false;
      title.classList.add("fade");
      setTimeout(() => {
        title.innerHTML = FULL_TITLE;
        title.classList.remove("shrunk");
        title.classList.remove("fade");
        leftSep.classList.remove("hidden");
        rightSep.classList.remove("hidden");
        nav.classList.remove("scrolled");
      }, 100);
    }
  });
});

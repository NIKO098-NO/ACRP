(function () {
  const OWNER_DISCORD_ID = "1473453547936022794";
  let meCache = null;

  const menuBtn = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  if (menuBtn && navLinks) {
    menuBtn.addEventListener("click", function () {
      navLinks.classList.toggle("open");
    });

    navLinks.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navLinks.classList.remove("open");
      });
    });
  }

  // Ensure auth links target the running backend server even if page is opened via file://
  const serverBase =
    window.location.protocol === "http:" || window.location.protocol === "https:"
      ? window.location.origin
      : "http://localhost:3000";
  document.querySelectorAll("[data-server-route]").forEach(function (el) {
    const route = el.getAttribute("data-server-route");
    if (!route) return;
    el.setAttribute("href", serverBase + route);
  });

  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add("show");
      });
    },
    { threshold: 0.1 }
  );
  document.querySelectorAll(".reveal").forEach(function (el) {
    observer.observe(el);
  });

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmtDate(dateString) {
    if (!dateString) return "TBD";
    const d = new Date(dateString + "T00:00:00");
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  async function loadContent() {
    const res = await fetch("/api/content");
    if (!res.ok) throw new Error("Failed to load content");
    return res.json();
  }

  async function getMe() {
    if (meCache) return meCache;
    const res = await fetch("/api/me");
    meCache = await res.json();
    return meCache;
  }

  async function renderOwnerGreeting() {
    const me = await getMe();
    if (!me?.authenticated || me?.user?.id !== OWNER_DISCORD_ID) return;
    if (document.getElementById("ownerGreeting")) return;
    const nav = document.querySelector(".site-nav");
    if (!nav) return;
    const banner = document.createElement("div");
    banner.id = "ownerGreeting";
    banner.className = "owner-greeting";
    banner.textContent = "Welcome Sir Zach, the system is at your disposal.";
    nav.insertAdjacentElement("afterend", banner);
  }

  async function handleVerifyRedirectFlow() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") !== "1") return;

    const me = await getMe();
    const nav = document.querySelector(".site-nav");
    if (!nav) return;

    const notice = document.createElement("div");
    notice.className = "owner-greeting";

    if (me?.authenticated && me?.isStaff && params.get("staff") === "1") {
      notice.textContent = "Verification complete. Redirecting to Staff Panel...";
      nav.insertAdjacentElement("afterend", notice);
      setTimeout(function () {
        window.location.href = "/panel.html";
      }, 1800);
      return;
    }

    if (me?.authenticated && !me?.isStaff) {
      notice.textContent = "Verification complete, but your account does not have a required staff role.";
    } else {
      notice.textContent = "Verification could not be completed. Please try Discord login again.";
    }

    nav.insertAdjacentElement("afterend", notice);
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  function renderHome(content) {
    const title = document.getElementById("heroTitle");
    const tagline = document.getElementById("heroTagline");
    const hero = document.getElementById("heroSection");
    if (title) title.textContent = content.site?.heroTitle || "Alabama State Roleplay";
    if (tagline) tagline.textContent = content.site?.heroTagline || "";
    if (hero && content.site?.heroBackground) {
      hero.style.setProperty("--hero-bg", `url('${content.site.heroBackground}')`);
    }
  }

  function renderEvents(content) {
    const grid = document.getElementById("eventsGrid");
    if (!grid) return;
    const events = Array.isArray(content.events) ? content.events : [];
    grid.innerHTML = events
      .map(function (evt) {
        return (
          '<article class="event-card reveal show">' +
          "<h5>" + esc(evt.title) + "</h5>" +
          '<div><span class="tag">' + fmtDate(evt.date) + '</span><span class="tag">' + esc(evt.dept || "General") + "</span></div>" +
          "<p>" + esc(evt.desc || "") + "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderStaff(content) {
    const grid = document.getElementById("staffGrid");
    if (!grid) return;
    const staff = Array.isArray(content.staff) ? content.staff : [];
    grid.innerHTML = staff
      .map(function (member) {
        return (
          '<article class="card reveal show" style="text-align:center;">' +
          '<img class="staff-photo" src="' + esc(member.pfp || "") + '" alt="' + esc(member.name || "Staff") + '">' +
          "<h4>" + esc(member.name || "") + "</h4>" +
          "<p><strong>" + esc(member.role || "") + "</strong></p>" +
          "<p>" + esc(member.bio || "") + "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderGallery(content) {
    const grid = document.getElementById("galleryGrid");
    if (!grid) return;
    const gallery = Array.isArray(content.gallery) ? content.gallery : [];
    grid.innerHTML = gallery
      .map(function (item) {
        return (
          '<article class="media-card reveal show">' +
          '<img src="' + esc(item.image || "") + '" alt="' + esc(item.title || "Gallery item") + '">' +
          '<div class="body"><h4>' + esc(item.title || "") + "</h4><p>" + esc(item.caption || "") + "</p></div>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderRules(content) {
    const grid = document.getElementById("rulesGrid");
    if (!grid) return;
    const rules = Array.isArray(content.rules) ? content.rules : [];
    grid.innerHTML = rules
      .map(function (rule, i) {
        return '<article class="card reveal show"><h4>Rule ' + (i + 1) + "</h4><p>" + esc(rule) + "</p></article>";
      })
      .join("");
  }

  async function setupPanel(content) {
    const panelRoot = document.getElementById("panelRoot");
    if (!panelRoot) return;

    const me = await getMe();

    const authBox = document.getElementById("authBox");
    const editorBox = document.getElementById("editorBox");
    const accountInfo = document.getElementById("accountInfo");

    if (!me.authenticated) {
      authBox.style.display = "block";
      editorBox.style.display = "none";
      return;
    }

    if (!me.isStaff) {
      authBox.style.display = "none";
      editorBox.style.display = "none";
      accountInfo.innerHTML = '<p class="warn">Logged in as ' + esc(me.user.username) + " but you do not have a required staff role.</p>";
      return;
    }

    authBox.style.display = "none";
    editorBox.style.display = "block";

    const avatar = me.user.avatar
      ? `https://cdn.discordapp.com/avatars/${me.user.id}/${me.user.avatar}.png?size=128`
      : "https://cdn.discordapp.com/embed/avatars/0.png";

    accountInfo.innerHTML =
      '<div class="account-card">' +
      '<img src="' + avatar + '" alt="Discord avatar">' +
      '<div><h4>' + esc(me.user.username) + "</h4>" +
      "<p>Email: " + esc(me.user.email || "No email") + "</p>" +
      "<p>User ID: " + esc(me.user.id) + "</p></div></div>";

    const siteField = document.getElementById("siteJson");
    const eventsField = document.getElementById("eventsJson");
    const staffField = document.getElementById("staffJson");
    const galleryField = document.getElementById("galleryJson");
    const rulesField = document.getElementById("rulesJson");
    const saveBtn = document.getElementById("saveAllBtn");
    const saveStatus = document.getElementById("saveStatus");

    siteField.value = JSON.stringify(content.site || {}, null, 2);
    eventsField.value = JSON.stringify(content.events || [], null, 2);
    staffField.value = JSON.stringify(content.staff || [], null, 2);
    galleryField.value = JSON.stringify(content.gallery || [], null, 2);
    rulesField.value = JSON.stringify(content.rules || [], null, 2);

    saveBtn.onclick = async function () {
      try {
        const payload = {
          site: JSON.parse(siteField.value),
          events: JSON.parse(eventsField.value),
          staff: JSON.parse(staffField.value),
          gallery: JSON.parse(galleryField.value),
          rules: JSON.parse(rulesField.value),
        };

        const res = await fetch("/api/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const msg = await res.json().catch(function () {
            return { error: "Save failed" };
          });
          throw new Error(msg.error || "Save failed");
        }

        saveStatus.textContent = "Saved successfully.";
      } catch (err) {
        saveStatus.textContent = "Error: " + err.message;
      }
    };
  }

  (async function init() {
    try {
      const content = await loadContent();
      await handleVerifyRedirectFlow();
      await renderOwnerGreeting();
      renderHome(content);
      renderEvents(content);
      renderStaff(content);
      renderGallery(content);
      renderRules(content);
      await setupPanel(content);
    } catch (err) {
      console.error(err);
    }
  })();
})();

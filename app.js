/* Property Viewing Notebook - a single-page, offline-first viewing companion.
 *
 * Everything is local. Records live in this browser's localStorage on the phone,
 * and there is no network request anywhere in this file. Share and Copy are the
 * only ways data leaves the device, and both are started by a tap.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "pvn.properties.v1";
  var SHARE_TITLE = "Property viewing shortlist";
  var UNKNOWN = "Unknown";

  // ---------------------------------------------------------------- helpers
  function $(selector, root) { return (root || document).querySelector(selector); }
  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }
  function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }
  function make(tag, className, textValue) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (textValue !== undefined && textValue !== null) { node.textContent = textValue; }
    return node;
  }

  // ------------------------------------------------------------- formatting
  // An unknown figure is a real state ("I did not find out"), and it is not the
  // same as zero. A blank field becomes null -> "Unknown"; an entered 0 becomes
  // 0 -> "R0". The two must never render the same way.
  function money(value) {
    if (value === null || value === undefined || value === "") { return UNKNOWN; }
    var n = Number(value);
    if (!isFinite(n)) { return UNKNOWN; }
    var rounded = Math.round(n);
    var sign = rounded < 0 ? "-" : "";
    var grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return "R" + sign + grouped;
  }
  function monthly(value) {
    if (isUnknown(value)) { return UNKNOWN; }
    // A genuine R0 is not "R0 per month": it is the answer "there is no levy".
    if (Number(value) === 0) { return "R0"; }
    return money(value) + "/m";
  }
  function beds(value) {
    if (value === null || value === undefined || value === "") { return UNKNOWN; }
    var n = Number(value);
    return n === 1 ? "1 bed" : n + " beds";
  }
  function toOptionalNumber(raw) {
    if (raw === null || raw === undefined) { return null; }
    var trimmed = String(raw).trim();
    if (trimmed === "") { return null; }
    var n = Number(trimmed);
    return isFinite(n) ? n : null;
  }
  function hasText(value) { return typeof value === "string" && value.trim() !== ""; }
  function oneLine(value) { return String(value).replace(/\s+/g, " ").trim(); }
  function isUnknown(value) { return value === null || value === undefined || value === ""; }

  // --------------------------------------------------------------- storage
  // Records survive closing and reopening the app because they are written to
  // localStorage on the phone, not to a server. A corrupt or unreadable store is
  // treated as empty rather than crashing the notebook at a viewing.
  var store = {
    load: function () {
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) { return []; }
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(normalise) : [];
      } catch (error) {
        return [];
      }
    },
    save: function (properties) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(properties));
        return true;
      } catch (error) {
        return false;
      }
    }
  };

  function normalise(record) {
    record = record || {};
    return {
      id: record.id || newId(),
      listingUrl: typeof record.listingUrl === "string" ? record.listingUrl.trim() : "",
      suburb: typeof record.suburb === "string" ? record.suburb.trim() : "",
      askingPrice: toOptionalNumber(record.askingPrice),
      bedrooms: toOptionalNumber(record.bedrooms),
      monthlyRates: toOptionalNumber(record.monthlyRates),
      monthlyLevy: toOptionalNumber(record.monthlyLevy),
      note: typeof record.note === "string" ? record.note : "",
      followUpQuestions: typeof record.followUpQuestions === "string" ? record.followUpQuestions : "",
      highlights: typeof record.highlights === "string" ? record.highlights : "",
      shortlisted: record.shortlisted === true,
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: record.updatedAt || new Date().toISOString()
    };
  }

  function newId() {
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ----------------------------------------------------------------- state
  var state = {
    properties: [],
    view: "notebook",
    editingId: null,
    selection: {}   // property id -> true, for the share picker
  };

  // ------------------------------------------------------------------ views
  var VIEWS = ["notebook", "compare", "share"];
  function showView(name) {
    if (name === "capture") {
      setViewVisibility("capture");
      return;
    }
    if (VIEWS.indexOf(name) === -1) { name = "notebook"; }
    state.view = name;
    setViewVisibility(name);
    $all(".tab[data-view]").forEach(function (tab) {
      if (tab.getAttribute("data-view") === name) {
        tab.setAttribute("aria-current", "page");
      } else {
        tab.removeAttribute("aria-current");
      }
    });
    if (name === "notebook") { renderNotebook(); }
    if (name === "compare") { renderCompare(); }
    if (name === "share") { renderShare(); }
    window.scrollTo(0, 0);
  }

  function setViewVisibility(name) {
    $("#view-notebook").hidden = name !== "notebook";
    $("#view-capture").hidden = name !== "capture";
    $("#view-compare").hidden = name !== "compare";
    $("#view-share").hidden = name !== "share";
  }

  // --------------------------------------------------------------- notebook
  function sortedProperties() {
    return state.properties.slice().sort(function (a, b) {
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
  }

  function renderNotebook() {
    var list = $("#property-list");
    clear(list);
    var properties = sortedProperties();
    $("#notebook-empty").hidden = properties.length > 0;
    properties.forEach(function (property) {
      list.appendChild(propertyCard(property));
    });
  }

  function propertyCard(property) {
    var li = make("li", "card" + (property.shortlisted ? " is-shortlisted" : ""));
    li.setAttribute("data-id", property.id);

    var head = make("div", "card-head");
    head.appendChild(make("p", "card-suburb", property.suburb || "Untitled property"));
    head.appendChild(make("span", "card-price", money(property.askingPrice)));
    li.appendChild(head);

    var facts = make("div", "facts");
    facts.appendChild(fact("Beds: " + beds(property.bedrooms), isUnknown(property.bedrooms)));
    facts.appendChild(fact("Rates: " + monthly(property.monthlyRates), isUnknown(property.monthlyRates)));
    facts.appendChild(fact("Levy: " + monthly(property.monthlyLevy), isUnknown(property.monthlyLevy)));
    li.appendChild(facts);

    if (hasText(property.listingUrl)) {
      var linkP = make("p", "card-notes");
      var a = make("a", null, property.listingUrl);
      a.href = property.listingUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      linkP.appendChild(a);
      li.appendChild(linkP);
    }
    if (hasText(property.highlights)) {
      li.appendChild(noteBlock("Highlights (shareable)", oneLine(property.highlights)));
    }
    if (hasText(property.note)) {
      li.appendChild(noteBlock("Private note", oneLine(property.note)));
    }
    if (hasText(property.followUpQuestions)) {
      li.appendChild(noteBlock("Private follow-up questions", oneLine(property.followUpQuestions)));
    }

    var actions = make("div", "card-actions");
    actions.appendChild(button("Edit", "edit", property.id));
    var shortBtn = button(property.shortlisted ? "Shortlisted \u2713" : "Shortlist", "shortlist", property.id);
    shortBtn.setAttribute("aria-pressed", property.shortlisted ? "true" : "false");
    actions.appendChild(shortBtn);
    actions.appendChild(button("Share this", "share-one", property.id));
    li.appendChild(actions);
    return li;
  }

  function fact(label, unknown) {
    return make("span", "fact" + (unknown ? " unknown" : ""), label);
  }

  function noteBlock(label, value) {
    var p = make("p", "card-notes");
    p.appendChild(make("span", "label", label));
    p.appendChild(document.createTextNode(value));
    return p;
  }

  function button(label, action, id) {
    var b = make("button", null, label);
    b.type = "button";
    b.setAttribute("data-action", action);
    if (id) { b.setAttribute("data-id", id); }
    return b;
  }

  // ---------------------------------------------------------------- capture
  var FIELDS = [
    "listingUrl", "suburb", "askingPrice", "bedrooms",
    "monthlyRates", "monthlyLevy", "note", "followUpQuestions", "highlights"
  ];

  function openCapture(id) {
    var form = $("#property-form");
    form.reset();
    $("#form-error").hidden = true;
    state.editingId = id || null;
    var record = id ? findProperty(id) : null;
    $("#capture-heading").textContent = record ? "Edit property" : "Add a property";
    $("#delete-property").hidden = !record;
    if (record) {
      $("#field-id").value = record.id;
      FIELDS.forEach(function (name) {
        var field = $("#field-" + name);
        if (!field) { return; }
        var value = record[name];
        field.value = (value === null || value === undefined) ? "" : String(value);
      });
    } else {
      $("#field-id").value = "";
    }
    showView("capture");
    var first = $("#field-listingUrl");
    if (first && first.focus) { first.focus(); }
  }

  function findProperty(id) {
    for (var i = 0; i < state.properties.length; i++) {
      if (state.properties[i].id === id) { return state.properties[i]; }
    }
    return null;
  }

  function saveProperty(event) {
    if (event) { event.preventDefault(); }
    var suburb = $("#field-suburb").value.trim();
    var priceRaw = $("#field-askingPrice").value.trim();
    var price = toOptionalNumber(priceRaw);
    var errorNode = $("#form-error");

    if (suburb === "") {
      errorNode.textContent = "Please enter the suburb.";
      errorNode.hidden = false;
      $("#field-suburb").focus();
      return;
    }
    if (price === null || price < 0) {
      errorNode.textContent = "Please enter the asking price in rand.";
      errorNode.hidden = false;
      $("#field-askingPrice").focus();
      return;
    }
    errorNode.hidden = true;

    var now = new Date().toISOString();
    var existing = state.editingId ? findProperty(state.editingId) : null;
    var record = normalise({
      id: existing ? existing.id : newId(),
      listingUrl: $("#field-listingUrl").value,
      suburb: suburb,
      askingPrice: price,
      bedrooms: $("#field-bedrooms").value,
      monthlyRates: $("#field-monthlyRates").value,
      monthlyLevy: $("#field-monthlyLevy").value,
      note: $("#field-note").value,
      followUpQuestions: $("#field-followUpQuestions").value,
      highlights: $("#field-highlights").value,
      shortlisted: existing ? existing.shortlisted : false,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    });

    if (existing) {
      state.properties = state.properties.map(function (item) {
        return item.id === record.id ? record : item;
      });
    } else {
      state.properties.push(record);
    }
    persist();
    state.editingId = null;
    showView("notebook");
  }

  function deleteProperty() {
    if (!state.editingId) { return; }
    var id = state.editingId;
    state.properties = state.properties.filter(function (item) { return item.id !== id; });
    delete state.selection[id];
    persist();
    state.editingId = null;
    showView("notebook");
  }

  function toggleShortlist(id) {
    state.properties = state.properties.map(function (item) {
      if (item.id === id) {
        item = normalise(Object.assign({}, item, {
          shortlisted: !item.shortlisted,
          updatedAt: new Date().toISOString()
        }));
      }
      return item;
    });
    persist();
    renderNotebook();
  }

  function persist() {
    store.save(state.properties);
  }

  // ---------------------------------------------------------------- compare
  function shortlisted() {
    return sortedProperties().filter(function (item) { return item.shortlisted; });
  }

  function renderCompare() {
    var grid = $("#compare-cards");
    clear(grid);
    var chosen = shortlisted();
    $("#compare-empty").hidden = chosen.length > 0;
    chosen.forEach(function (property) {
      grid.appendChild(compareCard(property));
    });
  }

  function compareCard(property) {
    var card = make("article", "compare-card");
    card.setAttribute("data-id", property.id);
    card.appendChild(make("h3", null, property.suburb || "Untitled property"));
    card.appendChild(compareRow("Asking price", money(property.askingPrice), isUnknown(property.askingPrice)));
    card.appendChild(compareRow("Bedrooms", beds(property.bedrooms), isUnknown(property.bedrooms)));
    card.appendChild(compareRow("Monthly rates", monthly(property.monthlyRates), isUnknown(property.monthlyRates)));
    card.appendChild(compareRow("Monthly levy", monthly(property.monthlyLevy), isUnknown(property.monthlyLevy)));
    card.appendChild(compareRow("Highlights", hasText(property.highlights) ? oneLine(property.highlights) : "\u2014", false));
    card.appendChild(compareRow("Outstanding questions",
      hasText(property.followUpQuestions) ? oneLine(property.followUpQuestions) : "None recorded", false));
    if (hasText(property.listingUrl)) {
      var row = make("div", "row");
      row.appendChild(make("span", "k", "Listing"));
      var v = make("span", "v");
      var a = make("a", null, "Open link");
      a.href = property.listingUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      v.appendChild(a);
      row.appendChild(v);
      card.appendChild(row);
    }
    return card;
  }

  function compareRow(key, value, unknown) {
    var row = make("div", "row");
    row.appendChild(make("span", "k", key));
    row.appendChild(make("span", "v" + (unknown ? " unknown" : ""), value));
    return row;
  }

  // ------------------------------------------------------------------ share
  // The draft is built ONLY from shareable fields: suburb, price, beds, rates,
  // levy, the listing link and the highlights. The private viewing note and the
  // follow-up questions are deliberately absent from this function, so there is
  // no path by which they can reach the message.
  function buildDraft(properties) {
    var lines = [];
    lines.push("Property viewing shortlist");
    lines.push(properties.length === 1 ? "1 property" : properties.length + " properties");
    lines.push("");
    properties.forEach(function (property, index) {
      lines.push((index + 1) + ") " + (property.suburb || "Untitled property"));
      lines.push("   Price: " + money(property.askingPrice));
      lines.push("   Beds: " + beds(property.bedrooms) +
                 "  |  Rates: " + monthly(property.monthlyRates) +
                 "  |  Levy: " + monthly(property.monthlyLevy));
      if (hasText(property.listingUrl)) {
        lines.push("   Link: " + property.listingUrl.trim());
      }
      if (hasText(property.highlights)) {
        lines.push("   Highlights: " + oneLine(property.highlights));
      }
      lines.push("");
    });
    lines.push("Sent from my shortlist.");
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function renderShare() {
    var container = $("#share-picker-list");
    clear(container);
    var properties = sortedProperties();
    if (properties.length === 0) {
      container.appendChild(make("p", "hint", "No properties yet. Add one first."));
    }
    if (!state.selectionInitialised) {
      properties.forEach(function (property) {
        if (property.shortlisted) { state.selection[property.id] = true; }
      });
      state.selectionInitialised = true;
    }
    properties.forEach(function (property) {
      var row = make("div", "pick");
      var input = make("input");
      input.type = "checkbox";
      input.id = "pick-" + property.id;
      input.checked = state.selection[property.id] === true;
      input.addEventListener("change", function () {
        state.selection[property.id] = input.checked;
        updateDraft();
      });
      var label = make("label", null, (property.suburb || "Untitled") + " \u2014 " + money(property.askingPrice));
      label.setAttribute("for", input.id);
      row.appendChild(input);
      row.appendChild(label);
      container.appendChild(row);
    });
    updateDraft();
  }

  function selectedProperties() {
    return sortedProperties().filter(function (property) {
      return state.selection[property.id] === true;
    });
  }

  function updateDraft() {
    $("#draft").value = buildDraft(selectedProperties());
    setStatus("", false);
  }

  function setStatus(message, isError) {
    var node = $("#copy-status");
    node.textContent = message || "";
    node.hidden = !message;
    node.className = isError ? "error" : "status";
  }

  function shareMessage() {
    var message = $("#draft").value;
    if (!message.trim()) {
      setStatus("Nothing to share yet - pick at least one property.", true);
      return;
    }
    if (navigator.share) {
      navigator.share({ title: SHARE_TITLE, text: message }).then(function () {
        setStatus("Shared.", false);
      }).catch(function (error) {
        if (error && error.name === "AbortError") { return; }
        setStatus("The share sheet was unavailable. Use Copy message.", true);
      });
      return;
    }
    setStatus("This browser has no share sheet. Use Copy message.", true);
  }

  function copyMessage() {
    var message = $("#draft").value;
    if (!message.trim()) {
      setStatus("Nothing to copy yet - pick at least one property.", true);
      return;
    }
    copyText(message).then(function (ok) {
      setStatus(ok ? "Message copied - paste it into WhatsApp." : "Copy failed. Select the text and copy it manually.", !ok);
    });
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).then(function () { return true; })
        .catch(function () { return legacyCopy(value); });
    }
    return Promise.resolve(legacyCopy(value));
  }

  function legacyCopy(value) {
    try {
      var area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-1000px";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, area.value.length);
      var ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch (error) {
      return false;
    }
  }

  // ----------------------------------------------------------------- events
  function wireEvents() {
    $all(".tab[data-view]").forEach(function (tab) {
      tab.addEventListener("click", function () { showView(tab.getAttribute("data-view")); });
    });
    $('.tab[data-action="add"]').addEventListener("click", function () { openCapture(null); });

    $("#property-form").addEventListener("submit", saveProperty);
    $("#cancel-property").addEventListener("click", function () {
      state.editingId = null;
      showView("notebook");
    });
    $("#delete-property").addEventListener("click", function () {
      if (window.confirm("Delete this property? This cannot be undone.")) { deleteProperty(); }
    });

    $("#property-list").addEventListener("click", function (event) {
      var trigger = event.target.closest ? event.target.closest("[data-action]") : null;
      if (!trigger) { return; }
      var action = trigger.getAttribute("data-action");
      var id = trigger.getAttribute("data-id");
      if (action === "edit") { openCapture(id); }
      else if (action === "shortlist") { toggleShortlist(id); }
      else if (action === "share-one") {
        state.selection = {};
        state.selection[id] = true;
        state.selectionInitialised = true;
        showView("share");
      }
    });

    $("#share-message").addEventListener("click", shareMessage);
    $("#copy-message").addEventListener("click", copyMessage);
  }

  // -------------------------------------------------------------- boot / PWA
  function updateOnlineBadge() {
    $("#offline-badge").hidden = navigator.onLine !== false;
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) { return; }
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* the offline shell is a bonus */ });
    });
  }

  function init() {
    state.properties = store.load();
    wireEvents();
    renderNotebook();
    showView("notebook");
    updateOnlineBadge();
    window.addEventListener("online", updateOnlineBadge);
    window.addEventListener("offline", updateOnlineBadge);
    registerServiceWorker();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

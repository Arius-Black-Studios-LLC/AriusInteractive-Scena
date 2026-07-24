/**
 * Arleco — asset marketplace (Ducats) with engine-ready bundles.
 */
(function () {
  var PURCHASES_PREFIX = "arleco_marketplace_purchases_";
  var LISTINGS_LOCAL = "arleco_marketplace_listings";

  var CATEGORIES = [
    { id: "", label: "All" },
    { id: "character", label: "Characters" },
    { id: "stage", label: "Stages" },
    { id: "item", label: "Items" },
    { id: "audio", label: "Audio" },
    { id: "pack", label: "Packs" },
  ];

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function getClient() {
    return window.ScenaAuth && ScenaAuth.getClient ? ScenaAuth.getClient() : null;
  }

  function useCloud() {
    return window.ScenaAuth && ScenaAuth.isConfigured && ScenaAuth.isConfigured() && !!getClient();
  }

  function scopeKey(userId) {
    return userId ? String(userId) : "guest";
  }

  function readPurchases(userId) {
    try {
      return JSON.parse(localStorage.getItem(PURCHASES_PREFIX + scopeKey(userId)) || "{}");
    } catch (e) {
      return {};
    }
  }

  function writePurchases(userId, map) {
    try {
      localStorage.setItem(PURCHASES_PREFIX + scopeKey(userId), JSON.stringify(map));
    } catch (e) { /* quota */ }
  }

  function readLocalListings() {
    try {
      return JSON.parse(localStorage.getItem(LISTINGS_LOCAL) || "[]");
    } catch (e) {
      return [];
    }
  }

  function writeLocalListings(list) {
    try {
      localStorage.setItem(LISTINGS_LOCAL, JSON.stringify(list));
    } catch (e) { /* quota */ }
  }

  function demoListings() {
    return [
      {
        id: "demo_char_aurora",
        title: "Aurora — sprite set",
        description: "Four expressions, stage-ready. Drop into any romance or drama project.",
        category: "character",
        price_ducats: 0,
        preview_data_url: "",
        purchase_count: 42,
        seller_name: "Arleco",
        bundle: {
          characterProfiles: [{
            id: "char_aurora",
            name: "Aurora",
            color: "#7c1128",
            sprites: [{
              id: "spr_neutral",
              label: "Neutral",
              dataUrl: "data:image/svg+xml," + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="320" viewBox="0 0 200 320">' +
                '<rect fill="#f5e6d3" width="200" height="320"/>' +
                '<circle cx="100" cy="80" r="40" fill="#c9a0dc"/>' +
                '<rect x="60" y="120" width="80" height="140" rx="20" fill="#7c1128"/>' +
                "</svg>"
              ),
            }],
          }],
          assets: [],
          backgroundScenes: [],
        },
      },
      {
        id: "demo_stage_cafe",
        title: "Café interior (3 layers)",
        description: "Background, middle, and foreground parallax layers at 1920×1080.",
        category: "stage",
        price_ducats: 15,
        preview_data_url: "",
        purchase_count: 18,
        seller_name: "Arleco",
        bundle: {
          backgroundScenes: [{
            id: "bg_cafe",
            name: "Café interior",
            layers: {
              bg: "data:image/svg+xml," + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect fill="#2a1810" width="320" height="180"/></svg>'
              ),
              mg: null,
              fg: null,
            },
          }],
          characterProfiles: [],
          assets: [],
        },
      },
    ];
  }

  function formatPrice(n) {
    n = Math.max(0, parseInt(n, 10) || 0);
    if (!n) return "Free";
    if (window.ScenaWallet && ScenaWallet.formatDucats) return ScenaWallet.formatDucats(n);
    return n + " Ducats";
  }

  function categoryLabel(id) {
    var cat = CATEGORIES.find(function (c) { return c.id === id; });
    return cat ? cat.label : id;
  }

  function remapBundleIds(bundle) {
    if (!window.ScenaStore || !ScenaStore.assetUid) return bundle;
    var idMap = {};
    function remap(oldId, prefix) {
      if (!oldId) return oldId;
      if (!idMap[oldId]) idMap[oldId] = ScenaStore.assetUid(prefix);
      return idMap[oldId];
    }
    var out = JSON.parse(JSON.stringify(bundle || {}));
    (out.characterProfiles || []).forEach(function (p) {
      p.id = remap(p.id, "char");
      (p.sprites || []).forEach(function (s) {
        s.id = remap(s.id, "spr");
      });
    });
    (out.backgroundScenes || []).forEach(function (b) {
      b.id = remap(b.id, "bg");
    });
    (out.assets || []).forEach(function (a) {
      a.id = remap(a.id, "a");
    });
    (out.metrics || []).forEach(function (m, i) {
      if (m.id) m.id = remap(m.id, "met");
    });
    return out;
  }

  function importBundleToSeries(series, bundle) {
    if (!series || !bundle) return { ok: false, count: 0 };
    bundle = remapBundleIds(bundle);
    var count = 0;

    (bundle.characterProfiles || []).forEach(function (p) {
      ScenaStore.ensureProfiles(series).push(p);
      count++;
    });
    (bundle.backgroundScenes || []).forEach(function (b) {
      ScenaStore.ensureBackgrounds(series).push(b);
      count++;
    });
    (bundle.assets || []).forEach(function (a) {
      ScenaStore.ensureAssets(series).push(a);
      count++;
    });
    (bundle.metrics || []).forEach(function (m) {
      if (!series.metrics) series.metrics = [];
      series.metrics.push(m);
      count++;
    });

    return { ok: count > 0, count: count };
  }

  function buildBundleFromSeries(series, spec) {
    spec = spec || {};
    var bundle = { characterProfiles: [], backgroundScenes: [], assets: [], metrics: [] };
    var preview = spec.previewDataUrl || "";

    if (spec.characterId) {
      var ch = ScenaStore.getCharacter(series, spec.characterId);
      if (ch) {
        bundle.characterProfiles.push(JSON.parse(JSON.stringify(ch)));
        preview = preview || ((ch.sprites && ch.sprites[0] && ch.sprites[0].dataUrl) || "");
      }
    }
    if (spec.stageId) {
      var bg = ScenaStore.getBackground(series, spec.stageId);
      if (bg) {
        bundle.backgroundScenes.push(JSON.parse(JSON.stringify(bg)));
        preview = preview || (bg.layers && bg.layers.bg) || "";
      }
    }
    if (spec.assetId) {
      var asset = ScenaStore.ensureAssets(series).find(function (a) { return a.id === spec.assetId; });
      if (asset) {
        bundle.assets.push(JSON.parse(JSON.stringify(asset)));
        preview = preview || asset.dataUrl || "";
      }
    }

    var empty = !bundle.characterProfiles.length && !bundle.backgroundScenes.length && !bundle.assets.length;
    return { bundle: bundle, preview: preview, empty: empty };
  }

  window.ScenaMarketplace = {
    CATEGORIES: CATEGORIES,

    loadListings: function (opts) {
      opts = opts || {};
      var category = opts.category || "";
      var query = opts.query || "";

      var sb = getClient();
      if (useCloud() && sb) {
        return sb.rpc("browse_marketplace_listings", {
          p_category: category || null,
          p_query: query || null,
          p_limit: opts.limit || 48,
        }).then(function (res) {
          if (res.error) {
            console.warn("browse_marketplace_listings:", res.error.message);
            return filterLocalListings(category, query);
          }
          var rows = res.data || [];
          return rows.length ? rows : filterLocalListings(category, query);
        }).catch(function () {
          return filterLocalListings(category, query);
        });
      }
      return Promise.resolve(filterLocalListings(category, query));
    },

    getListing: function (listingId, userId) {
      var sb = getClient();
      if (useCloud() && sb && listingId && String(listingId).indexOf("demo_") !== 0) {
        return sb.rpc("marketplace_listing_detail", { p_listing_id: listingId }).then(function (res) {
          if (res.error || !res.data) return findLocalListing(listingId, userId);
          var row = res.data;
          row.owned = row.owned || Boolean(readPurchases(userId)[listingId]);
          return row;
        }).catch(function () {
          return findLocalListing(listingId, userId);
        });
      }
      return Promise.resolve(findLocalListing(listingId, userId));
    },

    purchase: function (userId, listingId) {
      if (!userId) return Promise.reject(new Error("Sign in to get marketplace assets."));
      var local = findLocalListing(listingId, userId);
      var isLocalId = String(listingId).indexOf("demo_") === 0 || String(listingId).indexOf("local_") === 0;

      if (local && isLocalId) {
        var price = local.price_ducats || 0;
        var finish = function () {
          var purchases = readPurchases(userId);
          purchases[listingId] = true;
          writePurchases(userId, purchases);
          return { bundle: local.bundle, free: !price, balance: window.ScenaWallet ? ScenaWallet.getBalance(userId) : null };
        };
        if (price <= 0) return Promise.resolve(finish());
        if (!window.ScenaWallet) return Promise.reject(new Error("Wallet unavailable."));
        return ScenaWallet.load(userId).then(function () {
          if (ScenaWallet.getBalance(userId) < price) {
            return Promise.reject(new Error("Not enough Ducats. You need " + formatPrice(price) + "."));
          }
          var key = "arleco_wallet_" + userId;
          try {
            var raw = JSON.parse(localStorage.getItem(key) || "{}");
            raw.balance = Math.max(0, (raw.balance || 0) - price);
            localStorage.setItem(key, JSON.stringify(raw));
          } catch (e) { /* ignore */ }
          return ScenaWallet.load(userId).then(finish);
        });
      }

      var sb = getClient();
      if (!sb) {
        return Promise.reject(new Error("Marketplace requires sign-in."));
      }

      return sb.rpc("purchase_marketplace_listing", { p_listing_id: listingId }).then(function (res) {
        if (res.error) throw new Error(res.error.message || "Purchase failed.");
        var row = res.data || {};
        if (window.ScenaWallet) ScenaWallet.load(userId);
        return row;
      });
    },

    publishListing: function (userId, spec) {
      spec = spec || {};
      if (!userId) return Promise.reject(new Error("Sign in to sell on the marketplace."));
      if (!spec.bundle || spec.empty) return Promise.reject(new Error("Nothing to list — pick a character, stage, or asset."));

      var sb = getClient();
      if (!sb) {
        var list = readLocalListings();
        var entry = {
          id: "local_" + Date.now(),
          seller_id: userId,
          title: spec.title,
          description: spec.description || "",
          category: spec.category,
          price_ducats: spec.priceDucats || 0,
          preview_data_url: spec.previewDataUrl || "",
          bundle: spec.bundle,
          status: "live",
          purchase_count: 0,
          seller_name: spec.sellerName || "You",
        };
        list.unshift(entry);
        writeLocalListings(list);
        return Promise.resolve({ id: entry.id, local: true });
      }

      return sb.rpc("publish_marketplace_listing", {
        p_title: spec.title,
        p_description: spec.description || "",
        p_category: spec.category,
        p_price_ducats: spec.priceDucats || 0,
        p_bundle: spec.bundle,
        p_preview_data_url: spec.previewDataUrl || null,
      }).then(function (res) {
        if (res.error) throw new Error(res.error.message || "Could not publish listing.");
        return { id: res.data };
      });
    },

    importBundleToSeries: importBundleToSeries,

    buildBundleFromSeries: buildBundleFromSeries,

    renderStorePanel: function (listings, opts) {
      opts = opts || {};
      var selectedId = opts.selectedId || "";
      var balance = opts.balance != null ? opts.balance : null;

      var chips = CATEGORIES.map(function (c) {
        return '<button type="button" class="marketplace-chip' +
          (opts.category === c.id ? " is-active" : "") +
          '" data-marketplace-category="' + escapeAttr(c.id) + '">' + escapeHtml(c.label) + "</button>";
      }).join("");

      var cards = (listings || []).map(function (item) {
        var thumb = item.preview_data_url
          ? 'style="background-image:url(' + item.preview_data_url + ')"'
          : 'data-category="' + escapeAttr(item.category) + '"';
        return (
          '<button type="button" class="marketplace-card' + (selectedId === item.id ? " is-active" : "") +
            '" data-listing-id="' + escapeAttr(item.id) + '">' +
            '<span class="marketplace-card-thumb" ' + thumb + "></span>" +
            '<span class="marketplace-card-body">' +
              '<strong>' + escapeHtml(item.title) + "</strong>" +
              '<span class="marketplace-card-meta">' + escapeHtml(categoryLabel(item.category)) +
              " · " + escapeHtml(formatPrice(item.price_ducats)) + "</span>" +
            "</span>" +
          "</button>"
        );
      }).join("");

      if (!cards) cards = '<p class="resource-list-empty">No listings yet — be the first to sell a pack.</p>';

      var detail = opts.detailHtml || (
        '<div class="marketplace-detail-empty">' +
          "<h4>Arleco Asset Store</h4>" +
          "<p>Engine-ready characters, stages, items, and audio — packaged for your project, not loose files.</p>" +
          '<p class="field-hint">Pick a listing to preview and add to this series.</p>' +
        "</div>"
      );

      return (
        '<div class="marketplace-panel">' +
          '<div class="marketplace-toolbar">' +
            '<input type="search" class="marketplace-search" placeholder="Search assets…" value="' + escapeAttr(opts.query || "") + '">' +
            (balance != null
              ? '<span class="marketplace-balance" title="Your Ducat balance">' +
                  (window.ScenaWallet ? ScenaWallet.formatDucatsShort(balance) : balance + " \u2666") +
                "</span>"
              : "") +
          "</div>" +
          '<div class="marketplace-chips">' + chips + "</div>" +
          '<div class="marketplace-layout">' +
            '<div class="marketplace-grid">' + cards + "</div>" +
            '<div class="marketplace-detail">' + detail + "</div>" +
          "</div>" +
        "</div>"
      );
    },

    renderListingDetail: function (listing, opts) {
      opts = opts || {};
      if (!listing) return "";
      var preview = listing.preview_data_url
        ? '<div class="marketplace-preview" style="background-image:url(' + listing.preview_data_url + ')"></div>'
        : '<div class="marketplace-preview marketplace-preview--empty">' + escapeHtml(categoryLabel(listing.category)) + "</div>";

      var owned = listing.owned;
      var price = listing.price_ducats || 0;
      var actionLabel = owned ? "Add to project" : (price ? "Buy · " + formatPrice(price) : "Get free");

      return (
        preview +
        "<h4>" + escapeHtml(listing.title) + "</h4>" +
        '<p class="marketplace-seller">By ' + escapeHtml(listing.seller_name || "Creator") + "</p>" +
        "<p>" + escapeHtml(listing.description || "") + "</p>" +
        '<div class="marketplace-detail-actions">' +
          '<button type="button" class="btn btn-sm btn-primary marketplace-acquire-btn" data-listing-id="' + escapeAttr(listing.id) + '">' +
            escapeHtml(actionLabel) +
          "</button>" +
          (owned ? '<span class="field-hint">Already in your library — import again anytime.</span>' : "") +
        "</div>" +
        (!owned && price > 0 && opts.showPackUpsell && window.ScenaWallet
          ? '<div class="marketplace-upsell"><p class="field-hint">Need Ducats?</p>' + ScenaWallet.renderPackGrid({ buttonClass: "btn btn-sm btn-secondary ducat-pack-btn" }) + "</div>"
          : "")
      );
    },

    renderSellModalBody: function (series) {
      if (!series) return "<p>No project loaded.</p>";
      var chars = ScenaStore.ensureProfiles(series);
      var stages = ScenaStore.ensureBackgrounds(series);
      var assets = ScenaStore.ensureAssets(series).filter(function (a) { return !a.isDefault; });

      function options(list, prefix) {
        return list.map(function (item) {
          return '<option value="' + escapeAttr(prefix + ":" + item.id) + '">' + escapeHtml(item.name || item.label || "Untitled") + "</option>";
        }).join("");
      }

      return (
        '<div class="field"><label>Title</label><input type="text" id="mpSellTitle" maxlength="80" placeholder="Aurora sprite set"></div>' +
        '<div class="field"><label>Description</label><textarea id="mpSellDesc" rows="2" maxlength="400"></textarea></div>' +
        '<div class="field"><label>Category</label><select id="mpSellCategory">' +
          CATEGORIES.filter(function (c) { return c.id; }).map(function (c) {
            return '<option value="' + escapeAttr(c.id) + '">' + escapeHtml(c.label) + "</option>";
          }).join("") +
        "</select></div>" +
        '<div class="field"><label>Price (Ducats, 0 = free)</label><input type="number" id="mpSellPrice" min="0" max="9999" value="0"></div>' +
        '<div class="field"><label>Include from this project</label><select id="mpSellSource">' +
          '<option value="">— pick one —</option>' +
          (chars.length ? '<optgroup label="Characters">' + options(chars, "char") + "</optgroup>" : "") +
          (stages.length ? '<optgroup label="Stages">' + options(stages, "stage") + "</optgroup>" : "") +
          (assets.length ? '<optgroup label="Audio / items">' + options(assets, "asset") + "</optgroup>" : "") +
        "</select></div>" +
        '<p class="field-hint">Listings ship as engine-ready packs — buyers import directly into their graph editor.</p>'
      );
    },
  };

  function filterLocalListings(category, query) {
    var all = readLocalListings().concat(demoListings());
    return all.filter(function (item) {
      if (category && item.category !== category) return false;
      if (query) {
        var q = query.toLowerCase();
        return (item.title || "").toLowerCase().indexOf(q) >= 0 ||
          (item.description || "").toLowerCase().indexOf(q) >= 0;
      }
      return true;
    });
  }

  function findLocalListing(listingId, userId) {
    var all = readLocalListings().concat(demoListings());
    var item = all.find(function (l) { return l.id === listingId; }) || null;
    if (item) {
      item = Object.assign({}, item);
      item.owned = Boolean(readPurchases(userId)[listingId]);
    }
    return item;
  }
})();

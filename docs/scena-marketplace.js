/**
 * Arleco — asset marketplace (Ducats) with engine-ready bundles.
 */
(function () {
  var PURCHASES_PREFIX = "arleco_marketplace_purchases_";
  var LISTINGS_LOCAL = "arleco_marketplace_listings";
  var RATINGS_LOCAL = "arleco_marketplace_ratings";

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

  function readLocalRatings() {
    try {
      return JSON.parse(localStorage.getItem(RATINGS_LOCAL) || "{}");
    } catch (e) {
      return {};
    }
  }

  function writeLocalRatings(map) {
    try {
      localStorage.setItem(RATINGS_LOCAL, JSON.stringify(map));
    } catch (e) { /* quota */ }
  }

  function ratingStatsFor(listingId, userId) {
    var all = readLocalRatings()[listingId] || {};
    var keys = Object.keys(all);
    var sum = 0;
    keys.forEach(function (uid) { sum += Math.max(0, parseInt(all[uid], 10) || 0); });
    return {
      rating_avg: keys.length ? Math.round((sum / keys.length) * 100) / 100 : 0,
      rating_count: keys.length,
      my_rating: userId && all[userId] != null ? parseInt(all[userId], 10) || null : null,
    };
  }

  function formatRating(avg, count) {
    avg = Number(avg) || 0;
    count = Math.max(0, parseInt(count, 10) || 0);
    if (!count) return "Not rated";
    return "★ " + avg.toFixed(1) + " (" + count + ")";
  }

  function renderStarsInput(listingId, myRating, opts) {
    opts = opts || {};
    var canRate = !!opts.canRate;
    var stars = "";
    for (var i = 1; i <= 5; i++) {
      stars +=
        '<button type="button" class="mp-star-btn' + (myRating >= i ? " is-on" : "") + '"' +
          ' data-mp-rate-listing="' + escapeAttr(listingId) + '" data-mp-stars="' + i + '"' +
          (canRate ? "" : " disabled") +
          ' aria-label="' + i + ' star' + (i === 1 ? "" : "s") + '">★</button>';
    }
    return '<div class="mp-stars' + (canRate ? "" : " mp-stars--readonly") + '">' + stars + "</div>";
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
        rating_avg: 4.6,
        rating_count: 18,
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
        rating_avg: 4.2,
        rating_count: 9,
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

  function isJamFreeListing(listing) {
    if (!listing) return false;
    if (listing.jam_free === true) return true;
    var until = listing.jam_free_until;
    if (!until) return false;
    var t = new Date(until).getTime();
    return !isNaN(t) && t > Date.now();
  }

  function listPriceDucats(listing) {
    return Math.max(0, parseInt(listing && listing.price_ducats, 10) || 0);
  }

  function effectivePriceDucats(listing) {
    if (listing && listing.effective_price_ducats != null && !isNaN(Number(listing.effective_price_ducats))) {
      return Math.max(0, parseInt(listing.effective_price_ducats, 10) || 0);
    }
    if (isJamFreeListing(listing)) return 0;
    return listPriceDucats(listing);
  }

  /** Strikethrough list price when a jam promo is active. */
  function renderPriceHtml(listing) {
    var list = listPriceDucats(listing);
    var effective = effectivePriceDucats(listing);
    if (isJamFreeListing(listing) && list > 0) {
      return (
        '<span class="mp-price mp-price--jam-free">' +
          '<s class="mp-price-was">' + escapeHtml(formatPrice(list)) + "</s> " +
          '<span class="mp-price-now">Free</span>' +
          '<span class="mp-price-jam-tag"> during jam</span>' +
        "</span>"
      );
    }
    return '<span class="mp-price">' + escapeHtml(formatPrice(effective)) + "</span>";
  }

  function enrichListingsWithJamFree(listings) {
    listings = (listings || []).slice();
    if (!window.ScenaJams || !ScenaJams.jamFreeUntilByListingId) {
      return Promise.resolve(listings.map(normalizeJamFreeFields));
    }
    return Promise.resolve(ScenaJams.jamFreeUntilByListingId()).then(function (map) {
      map = map || {};
      return listings.map(function (item) {
        var row = Object.assign({}, item);
        var fromJam = map[row.id];
        if (fromJam) {
          var existing = row.jam_free_until ? new Date(row.jam_free_until).getTime() : 0;
          var next = new Date(fromJam).getTime();
          if (!existing || next > existing) row.jam_free_until = fromJam;
        }
        return normalizeJamFreeFields(row);
      });
    }).catch(function () {
      return listings.map(normalizeJamFreeFields);
    });
  }

  function normalizeJamFreeFields(listing) {
    if (!listing) return listing;
    var row = Object.assign({}, listing);
    var jamFree = isJamFreeListing(row);
    row.jam_free = jamFree;
    row.effective_price_ducats = jamFree ? 0 : listPriceDucats(row);
    return row;
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

    var characterIds = [];
    if (Array.isArray(spec.characterIds)) characterIds = spec.characterIds.slice();
    else if (spec.characterId) characterIds = [spec.characterId];

    var stageIds = [];
    if (Array.isArray(spec.stageIds)) stageIds = spec.stageIds.slice();
    else if (spec.stageId) stageIds = [spec.stageId];

    var assetIds = [];
    if (Array.isArray(spec.assetIds)) assetIds = spec.assetIds.slice();
    else if (spec.assetId) assetIds = [spec.assetId];

    characterIds.forEach(function (id) {
      var ch = ScenaStore.getCharacter(series, id);
      if (!ch) return;
      bundle.characterProfiles.push(JSON.parse(JSON.stringify(ch)));
      if (!preview) preview = (ch.sprites && ch.sprites[0] && ch.sprites[0].dataUrl) || "";
    });
    stageIds.forEach(function (id) {
      var bg = ScenaStore.getBackground(series, id);
      if (!bg) return;
      bundle.backgroundScenes.push(JSON.parse(JSON.stringify(bg)));
      if (!preview) preview = (bg.layers && bg.layers.bg) || "";
    });
    assetIds.forEach(function (id) {
      var asset = ScenaStore.ensureAssets(series).find(function (a) { return a.id === id; });
      if (!asset) return;
      bundle.assets.push(JSON.parse(JSON.stringify(asset)));
      if (!preview) preview = asset.dataUrl || "";
    });

    var empty = !bundle.characterProfiles.length && !bundle.backgroundScenes.length && !bundle.assets.length;
    var pieceCount =
      bundle.characterProfiles.length + bundle.backgroundScenes.length + bundle.assets.length;
    return { bundle: bundle, preview: preview, empty: empty, pieceCount: pieceCount };
  }

  function inferListingCategory(bundle, preferred) {
    if (preferred && preferred !== "pack") return preferred;
    if (!bundle) return preferred || "pack";
    var types = 0;
    if ((bundle.characterProfiles || []).length) types++;
    if ((bundle.backgroundScenes || []).length) types++;
    if ((bundle.assets || []).length) types++;
    var pieces =
      (bundle.characterProfiles || []).length +
      (bundle.backgroundScenes || []).length +
      (bundle.assets || []).length;
    if (types > 1 || pieces > 1) return "pack";
    if ((bundle.characterProfiles || []).length) return "character";
    if ((bundle.backgroundScenes || []).length) return "stage";
    var assets = bundle.assets || [];
    if (assets.some(function (a) { return a.kind === "keyItem"; })) return "item";
    if (assets.length) return "audio";
    return preferred || "pack";
  }

  window.ScenaMarketplace = {
    CATEGORIES: CATEGORIES,

    loadListings: function (opts) {
      opts = opts || {};
      var category = opts.category || "";
      var query = opts.query || "";

      var sb = getClient();
      var chain;
      if (useCloud() && sb) {
        chain = sb.rpc("browse_marketplace_listings", {
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
      } else {
        chain = Promise.resolve(filterLocalListings(category, query));
      }
      return chain.then(enrichListingsWithJamFree);
    },

    getListing: function (listingId, userId) {
      var sb = getClient();
      var chain;
      if (useCloud() && sb && listingId && String(listingId).indexOf("demo_") !== 0) {
        chain = sb.rpc("marketplace_listing_detail", { p_listing_id: listingId }).then(function (res) {
          if (res.error || !res.data) return findLocalListing(listingId, userId);
          var row = res.data;
          row.owned = row.owned || Boolean(readPurchases(userId)[listingId]);
          return row;
        }).catch(function () {
          return findLocalListing(listingId, userId);
        });
      } else {
        chain = Promise.resolve(findLocalListing(listingId, userId));
      }
      return chain.then(function (listing) {
        if (!listing) return null;
        return enrichListingsWithJamFree([listing]).then(function (rows) {
          return rows[0] || listing;
        });
      });
    },

    purchase: function (userId, listingId) {
      if (!userId) return Promise.reject(new Error("Sign in to get marketplace assets."));
      return ScenaMarketplace.getListing(listingId, userId).then(function (local) {
        var isLocalId = String(listingId).indexOf("demo_") === 0 || String(listingId).indexOf("local_") === 0;

        if (local && (local.is_seller || local.isSeller || local.seller_id === userId)) {
          return Promise.reject(new Error("You cannot buy your own listing — it is already in your library."));
        }

        if (local && isLocalId) {
          var price = effectivePriceDucats(local);
          var finish = function () {
            var purchases = readPurchases(userId);
            purchases[listingId] = true;
            writePurchases(userId, purchases);
            return {
              bundle: local.bundle,
              free: !price,
              jam_free: isJamFreeListing(local),
              balance: window.ScenaWallet ? ScenaWallet.getBalance(userId) : null,
            };
          };
          if (price <= 0) return Promise.resolve(finish());
          if (!window.ScenaWallet) return Promise.reject(new Error("Wallet unavailable."));
          return ScenaWallet.spendBalance(userId, price, "marketplace_demo", listingId).then(function () {
            return finish();
          });
        }

        var sb = getClient();
        if (!sb) {
          return Promise.reject(new Error("Marketplace requires sign-in."));
        }

        return sb.rpc("purchase_marketplace_listing", { p_listing_id: listingId }).then(function (res) {
          if (res.error) throw new Error(res.error.message || "Purchase failed.");
          var row = res.data || {};
          if (window.ScenaWallet && row.balance != null) {
            ScenaWallet.syncBalance(userId, row.balance);
          }
          if (window.ScenaWallet) {
            return ScenaWallet.load(userId).then(function () {
              return row;
            });
          }
          return row;
        });
      });
    },

    /** Extend jam-free window through judging end (seller only). */
    setJamFreeUntil: function (userId, listingId, untilIso) {
      if (!userId || !listingId || !untilIso) {
        return Promise.reject(new Error("Missing jam free details."));
      }
      var sb = getClient();
      var isLocalId = String(listingId).indexOf("demo_") === 0 || String(listingId).indexOf("local_") === 0;
      if (useCloud() && sb && !isLocalId) {
        return sb.rpc("set_listing_jam_free_until", {
          p_listing_id: listingId,
          p_until: untilIso,
        }).then(function (res) {
          if (res.error) throw new Error(res.error.message || "Could not apply jam free pricing.");
          // Mirror locally for UI enrichment
          var list = readLocalListings();
          var idx = list.findIndex(function (l) { return l.id === listingId; });
          if (idx >= 0) {
            var prev = list[idx].jam_free_until ? new Date(list[idx].jam_free_until).getTime() : 0;
            var next = new Date(untilIso).getTime();
            if (!prev || next > prev) list[idx].jam_free_until = untilIso;
            writeLocalListings(list);
          }
          return res.data || { jam_free_until: untilIso };
        });
      }
      var list = readLocalListings();
      var idx = list.findIndex(function (l) { return l.id === listingId; });
      if (idx < 0) {
        // Still record on a side map for demo listings
        try {
          var side = JSON.parse(localStorage.getItem("arleco_marketplace_jam_free") || "{}");
          var prevSide = side[listingId] ? new Date(side[listingId]).getTime() : 0;
          var nextSide = new Date(untilIso).getTime();
          if (!prevSide || nextSide > prevSide) side[listingId] = untilIso;
          localStorage.setItem("arleco_marketplace_jam_free", JSON.stringify(side));
        } catch (e) { /* ignore */ }
        return Promise.resolve({ jam_free_until: untilIso });
      }
      if (list[idx].seller_id && list[idx].seller_id !== userId) {
        return Promise.reject(new Error("Only the seller can mark jam free pricing."));
      }
      var prev = list[idx].jam_free_until ? new Date(list[idx].jam_free_until).getTime() : 0;
      var next = new Date(untilIso).getTime();
      if (!prev || next > prev) list[idx].jam_free_until = untilIso;
      writeLocalListings(list);
      return Promise.resolve({ jam_free_until: list[idx].jam_free_until });
    },

    listSellerListings: function (userId) {
      if (!userId) return Promise.resolve([]);
      var local = readLocalListings().filter(function (l) {
        return l.seller_id === userId && l.status !== "removed";
      });
      return Promise.resolve(local);
    },

    publishListing: function (userId, spec) {
      spec = spec || {};
      if (!userId) return Promise.reject(new Error("Sign in to sell on the marketplace."));
      if (!spec.bundle || spec.empty) return Promise.reject(new Error("Nothing to list — pick a character, stage, or asset."));

      if (window.ScenaContentPolicy) {
        var titleCheck = ScenaContentPolicy.check(spec.title || "");
        if (!titleCheck.ok) return Promise.reject(new Error(titleCheck.message));
        var descCheck = ScenaContentPolicy.check(spec.description || "");
        if (!descCheck.ok) return Promise.reject(new Error(descCheck.message));
      }

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
    inferListingCategory: inferListingCategory,

    /** Merge several library/project bundles into one pack listing payload. */
    mergeBundles: function (bundles) {
      var out = { characterProfiles: [], backgroundScenes: [], assets: [], metrics: [] };
      var preview = "";
      (bundles || []).forEach(function (bundle) {
        if (!bundle) return;
        (bundle.characterProfiles || []).forEach(function (ch) {
          out.characterProfiles.push(JSON.parse(JSON.stringify(ch)));
          if (!preview) preview = (ch.sprites && ch.sprites[0] && ch.sprites[0].dataUrl) || "";
        });
        (bundle.backgroundScenes || []).forEach(function (bg) {
          out.backgroundScenes.push(JSON.parse(JSON.stringify(bg)));
          if (!preview) preview = (bg.layers && bg.layers.bg) || "";
        });
        (bundle.assets || []).forEach(function (a) {
          out.assets.push(JSON.parse(JSON.stringify(a)));
          if (!preview) preview = a.dataUrl || "";
        });
        (bundle.metrics || []).forEach(function (m) {
          out.metrics.push(JSON.parse(JSON.stringify(m)));
        });
      });
      var empty = !out.characterProfiles.length && !out.backgroundScenes.length && !out.assets.length;
      var pieceCount = out.characterProfiles.length + out.backgroundScenes.length + out.assets.length;
      return { bundle: out, preview: preview, empty: empty, pieceCount: pieceCount };
    },

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
              " · " + renderPriceHtml(item) +
              (item.rating_count
                ? " · " + escapeHtml(formatRating(item.rating_avg, item.rating_count))
                : "") +
              "</span>" +
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
          (window.ScenaWallet
            ? '<section class="marketplace-ducat-buy">' +
                '<h3 class="marketplace-ducat-buy-title">Buy Ducats</h3>' +
                '<p class="field-hint">Top up your wallet for chapters, marketplace assets, and jam prizes.</p>' +
                ScenaWallet.renderPackGrid({ buttonClass: "btn btn-sm btn-secondary ducat-pack-btn" }) +
              "</section>"
            : "") +
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
      var isSeller = listing.is_seller || listing.isSeller ||
        (opts.viewerUserId && listing.seller_id && listing.seller_id === opts.viewerUserId);
      var listPrice = listPriceDucats(listing);
      var price = effectivePriceDucats(listing);
      var jamFree = isJamFreeListing(listing) && listPrice > 0;
      var actionHtml;
      if (isSeller) {
        actionHtml =
          '<button type="button" class="btn btn-sm btn-ghost" disabled>Your listing</button>' +
          '<span class="field-hint">You already own this — use My assets to import it into a project.</span>';
      } else {
        var actionLabel = owned
          ? "Add to project"
          : (price ? "Buy · " + formatPrice(price) : (jamFree ? "Get free (jam promo)" : "Get free"));
        actionHtml =
          '<button type="button" class="btn btn-sm btn-primary marketplace-acquire-btn" data-listing-id="' +
            escapeAttr(listing.id) + '">' + escapeHtml(actionLabel) + "</button>" +
          (owned ? '<span class="field-hint">Already in your library — import again anytime.</span>' : "") +
          (jamFree && !owned
            ? '<span class="field-hint mp-jam-free-note">Free while the jam’s voting period is live — then returns to ' +
                escapeHtml(formatPrice(listPrice)) + ".</span>"
            : "");
      }

      return (
        preview +
        "<h4>" + escapeHtml(listing.title) + "</h4>" +
        '<p class="marketplace-seller">By ' + escapeHtml(listing.seller_name || "Creator") +
          (isSeller ? " (you)" : "") + "</p>" +
        '<p class="marketplace-price-line">' + renderPriceHtml(listing) + "</p>" +
        '<p class="marketplace-rating-line">' +
          escapeHtml(formatRating(listing.rating_avg, listing.rating_count)) +
          (owned && !isSeller
            ? ' · <span class="field-hint">Your rating</span>'
            : "") +
        "</p>" +
        (owned && !isSeller
          ? renderStarsInput(listing.id, listing.my_rating || 0, { canRate: true })
          : (listing.rating_count
              ? renderStarsInput(listing.id, Math.round(Number(listing.rating_avg) || 0), { canRate: false })
              : "")) +
        "<p>" + escapeHtml(listing.description || "") + "</p>" +
        '<div class="marketplace-detail-actions">' + actionHtml + "</div>" +
        (!isSeller && !owned && price > 0 && opts.showPackUpsell && window.ScenaWallet
          ? '<div class="marketplace-upsell"><p class="field-hint">Need Ducats?</p>' + ScenaWallet.renderPackGrid({ buttonClass: "btn btn-sm btn-secondary ducat-pack-btn" }) + "</div>"
          : "")
      );
    },

    renderSellModalBody: function (series) {
      if (!series) return "<p>No project loaded.</p>";
      var chars = ScenaStore.ensureProfiles(series);
      var stages = ScenaStore.ensureBackgrounds(series);
      var assets = ScenaStore.ensureAssets(series).filter(function (a) { return !a.isDefault; });

      function checkRows(list, prefix, nameAttr) {
        if (!list.length) return '<p class="field-hint">None in this project yet.</p>';
        return list.map(function (item) {
          var id = prefix + ":" + item.id;
          return (
            '<label class="check-row">' +
              '<input type="checkbox" data-mp-pack-item="' + escapeAttr(id) + '" name="' + escapeAttr(nameAttr) + '">' +
              escapeHtml(item.name || item.label || "Untitled") +
            "</label>"
          );
        }).join("");
      }

      return (
        '<div class="field"><label>Pack title</label><input type="text" id="mpSellTitle" maxlength="80" placeholder="e.g. Café starter kit"></div>' +
        '<div class="field"><label>Description</label><textarea id="mpSellDesc" rows="2" maxlength="400" placeholder="What buyers get in this pack…"></textarea></div>' +
        '<div class="field"><label>Category</label><select id="mpSellCategory">' +
          CATEGORIES.filter(function (c) { return c.id; }).map(function (c) {
            var selected = c.id === "pack" ? " selected" : "";
            return '<option value="' + escapeAttr(c.id) + '"' + selected + ">" + escapeHtml(c.label) + "</option>";
          }).join("") +
        "</select>" +
          '<p class="field-hint">Pick <strong>Packs</strong> when including more than one piece. Single items can use Characters / Stages / etc.</p></div>' +
        '<div class="field"><label>Price (Ducats, 0 = free)</label><input type="number" id="mpSellPrice" min="0" max="9999" value="0"></div>' +
        '<div class="field"><label>Build your pack — select anything to include</label>' +
          '<div class="mp-pack-builder">' +
            '<div class="mp-pack-group"><strong>Characters</strong><div class="check-grid">' +
              checkRows(chars, "char", "mpChar") +
            "</div></div>" +
            '<div class="mp-pack-group"><strong>Stages</strong><div class="check-grid">' +
              checkRows(stages, "stage", "mpStage") +
            "</div></div>" +
            '<div class="mp-pack-group"><strong>Audio &amp; items</strong><div class="check-grid">' +
              checkRows(assets, "asset", "mpAsset") +
            "</div></div>" +
          "</div>" +
          '<p class="field-hint">Check multiple items to sell them together as one pack buyers import in one click.</p>' +
        "</div>"
      );
    },

    readSellModalSelection: function (root) {
      root = root || document;
      var characterIds = [];
      var stageIds = [];
      var assetIds = [];
      root.querySelectorAll("[data-mp-pack-item]:checked").forEach(function (el) {
        var raw = el.getAttribute("data-mp-pack-item") || "";
        var parts = raw.split(":");
        if (parts[0] === "char" && parts[1]) characterIds.push(parts[1]);
        else if (parts[0] === "stage" && parts[1]) stageIds.push(parts[1]);
        else if (parts[0] === "asset" && parts[1]) assetIds.push(parts[1]);
      });
      return { characterIds: characterIds, stageIds: stageIds, assetIds: assetIds };
    },

    formatRating: formatRating,

    rateListing: function (userId, listingId, stars) {
      if (!userId) return Promise.reject(new Error("Sign in to rate assets."));
      stars = Math.max(1, Math.min(5, parseInt(stars, 10) || 0));
      if (!stars) return Promise.reject(new Error("Pick 1–5 stars."));
      var listingPromise = ScenaMarketplace.getListing(listingId, userId);
      return listingPromise.then(function (listing) {
        if (!listing) throw new Error("Listing not found.");
        if (listing.is_seller || listing.isSeller || listing.seller_id === userId) {
          throw new Error("You cannot rate your own listing.");
        }
        if (!listing.owned && !(readPurchases(userId)[listingId])) {
          throw new Error("Get this asset first, then you can rate it.");
        }
        var sb = getClient();
        var isLocalId = String(listingId).indexOf("demo_") === 0 || String(listingId).indexOf("local_") === 0;
        if (useCloud() && sb && !isLocalId) {
          return sb.rpc("rate_marketplace_listing", {
            p_listing_id: listingId,
            p_stars: stars,
          }).then(function (res) {
            if (res.error) throw new Error(res.error.message || "Could not save rating.");
            var data = res.data || {};
            // Mirror locally for jam scoring / offline display
            var map = readLocalRatings();
            map[listingId] = map[listingId] || {};
            map[listingId][userId] = stars;
            writeLocalRatings(map);
            return {
              listing_id: listingId,
              my_rating: data.my_rating || stars,
              rating_avg: Number(data.rating_avg) || stars,
              rating_count: parseInt(data.rating_count, 10) || 1,
            };
          });
        }
        var map = readLocalRatings();
        map[listingId] = map[listingId] || {};
        map[listingId][userId] = stars;
        writeLocalRatings(map);
        var stats = ratingStatsFor(listingId, userId);
        return {
          listing_id: listingId,
          my_rating: stars,
          rating_avg: stats.rating_avg,
          rating_count: stats.rating_count,
        };
      });
    },

    getListingRating: function (listingId, userId) {
      var sb = getClient();
      var isLocalId = String(listingId).indexOf("demo_") === 0 || String(listingId).indexOf("local_") === 0;
      if (useCloud() && sb && listingId && !isLocalId) {
        return sb.rpc("marketplace_listing_detail", { p_listing_id: listingId }).then(function (res) {
          if (res.error || !res.data) {
            return ratingStatsFor(listingId, userId);
          }
          return {
            rating_avg: Number(res.data.rating_avg) || 0,
            rating_count: parseInt(res.data.rating_count, 10) || 0,
            my_rating: res.data.my_rating != null ? parseInt(res.data.my_rating, 10) : null,
          };
        }).catch(function () {
          return ratingStatsFor(listingId, userId);
        });
      }
      return Promise.resolve(ratingStatsFor(listingId, userId));
    },
  };

  function filterLocalListings(category, query) {
    var all = readLocalListings().concat(demoListings()).map(function (item) {
      var stats = ratingStatsFor(item.id);
      return Object.assign({}, item, {
        rating_avg: item.rating_avg != null && !stats.rating_count ? item.rating_avg : (stats.rating_count ? stats.rating_avg : (item.rating_avg || 0)),
        rating_count: Math.max(item.rating_count || 0, stats.rating_count || 0),
      });
    });
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
      var stats = ratingStatsFor(listingId, userId);
      if (stats.rating_count) {
        item.rating_avg = stats.rating_avg;
        item.rating_count = stats.rating_count;
        item.my_rating = stats.my_rating;
      } else {
        item.rating_avg = item.rating_avg || 0;
        item.rating_count = item.rating_count || 0;
        item.my_rating = null;
      }
      try {
        var side = JSON.parse(localStorage.getItem("arleco_marketplace_jam_free") || "{}");
        if (side[listingId] && !item.jam_free_until) item.jam_free_until = side[listingId];
      } catch (e) { /* ignore */ }
      item = normalizeJamFreeFields(item);
    }
    return item;
  }
})();

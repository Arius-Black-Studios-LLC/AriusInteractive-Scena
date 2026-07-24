/**
 * Arleco — cross-project asset library (self-made + purchased).
 * Bundles use the same shape as the marketplace; import remaps IDs per project.
 */
(function () {
  var LIBRARY_PREFIX = "arleco_asset_library_";

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

  function scopeKey(userId) {
    return userId ? String(userId) : "guest";
  }

  function readLibrary(userId) {
    try {
      return JSON.parse(localStorage.getItem(LIBRARY_PREFIX + scopeKey(userId)) || "[]");
    } catch (e) {
      return [];
    }
  }

  function writeLibrary(userId, list) {
    try {
      localStorage.setItem(LIBRARY_PREFIX + scopeKey(userId), JSON.stringify(list || []));
    } catch (e) { /* quota */ }
  }

  function categoryLabel(id) {
    var cat = CATEGORIES.find(function (c) { return c.id === id; });
    return cat ? cat.label : id || "Asset";
  }

  function inferCategory(bundle) {
    if (!bundle) return "pack";
    if ((bundle.characterProfiles || []).length) return "character";
    if ((bundle.backgroundScenes || []).length) return "stage";
    var assets = bundle.assets || [];
    if (assets.some(function (a) { return a.kind === "keyItem"; })) return "item";
    if (assets.length) return "audio";
    return "pack";
  }

  function upsertEntry(userId, entry) {
    var list = readLibrary(userId);
    var idx = list.findIndex(function (e) { return e.id === entry.id; });
    entry.updatedAt = new Date().toISOString();
    if (!entry.createdAt) entry.createdAt = entry.updatedAt;
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], entry);
    else list.unshift(entry);
    writeLibrary(userId, list);
    return entry;
  }

  function importBundle(series, bundle) {
    if (!window.ScenaMarketplace || !ScenaMarketplace.importBundleToSeries) {
      return { ok: false, count: 0 };
    }
    return ScenaMarketplace.importBundleToSeries(series, bundle);
  }

  function syncPurchasedListings(userId) {
    if (!userId || !window.ScenaMarketplace) return Promise.resolve();
    var purchases = {};
    try {
      purchases = JSON.parse(localStorage.getItem("arleco_marketplace_purchases_" + scopeKey(userId)) || "{}");
    } catch (e) { /* ignore */ }
    var ids = Object.keys(purchases).filter(function (id) { return purchases[id]; });
    if (!ids.length) return Promise.resolve();
    return ids.reduce(function (chain, listingId) {
      return chain.then(function () {
        if (readLibrary(userId).some(function (e) { return e.listingId === listingId || e.id === "purchase_" + listingId; })) {
          return null;
        }
        return ScenaMarketplace.getListing(listingId, userId).then(function (listing) {
          if (listing && listing.bundle) ScenaAssetLibrary.recordPurchase(userId, listing);
        });
      });
    }, Promise.resolve());
  }

  window.ScenaAssetLibrary = {
    CATEGORIES: CATEGORIES,

    list: function (userId, opts) {
      opts = opts || {};
      return syncPurchasedListings(userId).then(function () {
        var rows = readLibrary(userId).slice();
        if (opts.category) {
          rows = rows.filter(function (r) { return r.category === opts.category; });
        }
        if (opts.query) {
          var q = opts.query.toLowerCase();
          rows = rows.filter(function (r) {
            return (r.title || "").toLowerCase().indexOf(q) >= 0 ||
              (r.sourceSeriesTitle || "").toLowerCase().indexOf(q) >= 0;
          });
        }
        if (opts.source) {
          rows = rows.filter(function (r) { return r.source === opts.source; });
        }
        return rows;
      });
    },

    get: function (userId, entryId) {
      return Promise.resolve(readLibrary(userId).find(function (e) { return e.id === entryId; }) || null);
    },

    recordPurchase: function (userId, listing) {
      if (!userId || !listing || !listing.bundle) return null;
      return upsertEntry(userId, {
        id: "purchase_" + listing.id,
        listingId: listing.id,
        source: "purchase",
        title: listing.title || "Purchased asset",
        category: listing.category || inferCategory(listing.bundle),
        bundle: listing.bundle,
        preview_data_url: listing.preview_data_url || "",
      });
    },

    saveFromSeries: function (userId, series, spec, meta) {
      meta = meta || {};
      if (!userId || !series || !window.ScenaMarketplace) {
        return Promise.reject(new Error("Sign in to save assets to your library."));
      }
      var built = ScenaMarketplace.buildBundleFromSeries(series, spec);
      if (built.empty) return Promise.reject(new Error("Nothing to save from this resource."));
      var resourceId = spec.characterId || spec.stageId || spec.assetId || "asset";
      var category = spec.characterId ? "character" : spec.stageId ? "stage" :
        (spec.assetId && series.assets && series.assets.find(function (a) { return a.id === spec.assetId && a.kind === "keyItem"; }))
          ? "item" : "audio";
      var title = meta.title || "Untitled asset";
      var entry = upsertEntry(userId, {
        id: "made_" + (meta.sourceSeriesId || series.id || "local") + "_" + resourceId,
        source: "made",
        sourceSeriesId: meta.sourceSeriesId || series.id,
        sourceSeriesTitle: meta.sourceSeriesTitle || series.title || "",
        title: title,
        category: category,
        bundle: built.bundle,
        preview_data_url: built.preview || "",
      });
      return Promise.resolve(entry);
    },

    importToSeries: function (series, entryId, userId) {
      return ScenaAssetLibrary.get(userId, entryId).then(function (entry) {
        if (!entry || !entry.bundle) return { ok: false, count: 0 };
        return importBundle(series, entry.bundle);
      });
    },

    remove: function (userId, entryId) {
      var list = readLibrary(userId).filter(function (e) { return e.id !== entryId; });
      writeLibrary(userId, list);
      return Promise.resolve(true);
    },

    publishFromLibrary: function (userId, entryId, spec) {
      spec = spec || {};
      if (!userId) return Promise.reject(new Error("Sign in to sell assets."));
      return ScenaAssetLibrary.get(userId, entryId).then(function (entry) {
        if (!entry) throw new Error("Asset not found in your library.");
        if (entry.source !== "made") {
          throw new Error("Only assets you created can be listed for sale. Purchased assets stay in your library for import only.");
        }
        if (!window.ScenaMarketplace) throw new Error("Marketplace unavailable.");
        if (!entry.bundle) throw new Error("This library entry has no pack data.");
        return ScenaMarketplace.publishListing(userId, {
          title: (spec.title || entry.title || "Untitled").trim(),
          description: (spec.description || "").trim(),
          category: spec.category || entry.category || "pack",
          priceDucats: Math.max(0, parseInt(spec.priceDucats, 10) || 0),
          bundle: entry.bundle,
          previewDataUrl: spec.previewDataUrl || entry.preview_data_url || "",
          sellerName: spec.sellerName || "Creator",
        }).then(function (result) {
          upsertEntry(userId, {
            id: entry.id,
            listingId: result.id,
            forSale: true,
            saleTitle: spec.title || entry.title,
          });
          return result;
        });
      });
    },

    renderSellModalBody: function (entry) {
      if (!entry) return "<p>No asset selected.</p>";
      var cats = (window.ScenaMarketplace && ScenaMarketplace.CATEGORIES)
        ? ScenaMarketplace.CATEGORIES.filter(function (c) { return c.id; })
        : CATEGORIES.filter(function (c) { return c.id; });
      var catOpts = cats.map(function (c) {
        return '<option value="' + escapeAttr(c.id) + '"' +
          (entry.category === c.id ? " selected" : "") + ">" + escapeHtml(c.label) + "</option>";
      }).join("");
      return (
        '<div class="field"><label>Listing title</label><input type="text" id="libSellTitle" maxlength="80" value="' +
          escapeAttr(entry.title || "") + '"></div>' +
        '<div class="field"><label>Description</label><textarea id="libSellDesc" rows="2" maxlength="400" placeholder="What buyers get…"></textarea></div>' +
        '<div class="field"><label>Category</label><select id="libSellCategory">' + catOpts + "</select></div>" +
        '<div class="field"><label>Price (Ducats, 0 = free)</label><input type="number" id="libSellPrice" min="0" max="9999" value="0"></div>' +
        '<p class="field-hint">You keep ownership — buyers get a copy for their projects. You can still import your original anytime.</p>'
      );
    },

    renderPanel: function (entries, opts) {
      opts = opts || {};
      var selectedId = opts.selectedId || "";
      var chips = CATEGORIES.map(function (c) {
        return '<button type="button" class="marketplace-chip' +
          (opts.category === c.id ? " is-active" : "") +
          '" data-library-category="' + escapeAttr(c.id) + '">' + escapeHtml(c.label) + "</button>";
      }).join("");

      var cards = (entries || []).map(function (item) {
        var thumb = item.preview_data_url
          ? 'style="background-image:url(' + item.preview_data_url + ')"'
          : 'data-category="' + escapeAttr(item.category) + '"';
        var badge = item.source === "purchase" ? "Purchased" : "Yours";
        return (
          '<button type="button" class="marketplace-card library-card' + (selectedId === item.id ? " is-active" : "") +
            '" data-library-id="' + escapeAttr(item.id) + '">' +
            '<span class="marketplace-card-thumb" ' + thumb + "></span>" +
            '<span class="marketplace-card-body">' +
              '<strong>' + escapeHtml(item.title) + "</strong>" +
              '<span class="marketplace-card-meta">' + escapeHtml(categoryLabel(item.category)) +
              " · " + escapeHtml(badge) + "</span>" +
            "</span>" +
          "</button>"
        );
      }).join("");

      if (!cards) {
        cards = '<p class="resource-list-empty">No assets saved yet. Save resources from a project, or buy packs from the shop.</p>';
      }

      var detail = opts.detailHtml || (
        '<div class="marketplace-detail-empty">' +
          "<h4>Your asset library</h4>" +
          "<p>Characters, stages, audio, and items you made or purchased — reuse them in any project without paying again.</p>" +
          '<p class="field-hint">Select an asset to import into the current series.</p>' +
        "</div>"
      );

      return (
        '<div class="marketplace-panel asset-library-panel">' +
          '<div class="asset-library-tabs">' +
            '<button type="button" class="asset-library-tab' + (opts.pageTab === "shop" ? "" : " is-active") +
              '" data-library-page="assets">My assets</button>' +
            '<button type="button" class="asset-library-tab' + (opts.pageTab === "shop" ? " is-active" : "") +
              '" data-library-page="shop">Shop</button>' +
          "</div>" +
          (opts.pageTab === "shop" ? (opts.shopHtml || "") :
            '<div class="marketplace-toolbar">' +
              '<input type="search" class="marketplace-search library-search" placeholder="Search your library…" value="' + escapeAttr(opts.query || "") + '">' +
            "</div>" +
            '<div class="marketplace-chips">' + chips + "</div>" +
            '<div class="marketplace-layout">' +
              '<div class="marketplace-grid">' + cards + "</div>" +
              '<div class="marketplace-detail">' + detail + "</div>" +
            "</div>"
          ) +
        "</div>"
      );
    },

    renderEntryDetail: function (entry, opts) {
      opts = opts || {};
      if (!entry) return "";
      var preview = entry.preview_data_url
        ? '<div class="marketplace-preview" style="background-image:url(' + entry.preview_data_url + ')"></div>'
        : '<div class="marketplace-preview marketplace-preview--empty">' + escapeHtml(categoryLabel(entry.category)) + "</div>";
      var sourceHint = entry.source === "purchase"
        ? "Purchased once — import into any project for free."
        : (entry.sourceSeriesTitle
          ? "Saved from “" + escapeHtml(entry.sourceSeriesTitle) + "”."
          : "Saved from your projects.");

      var seriesPicker = "";
      if (opts.seriesList && opts.seriesList.length) {
        seriesPicker =
          '<div class="field"><label>Import into series</label><select class="library-series-select">' +
          opts.seriesList.map(function (s) {
            return '<option value="' + escapeAttr(s.id) + '"' +
              (opts.selectedSeriesId === s.id ? " selected" : "") + ">" +
              escapeHtml(s.title || "Untitled") + "</option>";
          }).join("") +
          "</select></div>";
      }

      return (
        preview +
        "<h4>" + escapeHtml(entry.title) + "</h4>" +
        '<p class="marketplace-seller">' + sourceHint + "</p>" +
        seriesPicker +
        '<div class="marketplace-detail-actions">' +
          '<button type="button" class="btn btn-sm btn-primary library-import-btn" data-library-id="' + escapeAttr(entry.id) + '">' +
            escapeHtml(opts.importLabel || "Add to project") +
          "</button>" +
          (opts.showSell && entry.source === "made" && !entry.forSale
            ? '<button type="button" class="btn btn-sm btn-secondary library-sell-btn" data-library-id="' + escapeAttr(entry.id) + '">Sell on marketplace</button>'
            : "") +
          (entry.forSale
            ? '<span class="field-hint">Listed on the asset store' +
              (entry.listingId ? " · listing active" : "") + ".</span>"
            : "") +
          (opts.showRemove
            ? '<button type="button" class="btn btn-sm btn-ghost library-remove-btn" data-library-id="' + escapeAttr(entry.id) + '">Remove from library</button>'
            : "") +
        "</div>"
      );
    },
  };
})();

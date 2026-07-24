/**
 * Arleco — Ducats (virtual currency), chapter unlocks, creator earnings & cash-out.
 *
 * Economics (see docs/MONETIZATION.md):
 * - Readers buy Ducats in packs (~$0.07–$0.10 per Ducat retail).
 * - When a reader unlocks a paid chapter, 70% of spent Ducats credit the creator.
 * - Creators cash out earned Ducats at $0.05 each (minimum 500 Ducats / $25).
 * - The spread between retail and payout is platform margin (~45–60% gross).
 */
(function () {
  var STORAGE_PREFIX = "arleco_wallet_";
  var cache = {};

  var ECONOMICS = {
    CREATOR_SHARE: 0.7,
    PAYOUT_USD_CENTS_PER_DUCAT: 5,
    MIN_CASHOUT_DUCATS: 500,
    PLATFORM_NAME: "Arleco",
  };

  var DUCAT_PACKS = [
    { id: "ducat_10", ducats: 10, priceCents: 99, priceLabel: "$0.99", note: "Try a chapter" },
    { id: "ducat_55", ducats: 55, priceCents: 499, priceLabel: "$4.99", note: "50 + 5 bonus Ducats" },
    { id: "ducat_120", ducats: 120, priceCents: 999, priceLabel: "$9.99", note: "100 + 20 bonus — best value" },
    { id: "ducat_300", ducats: 300, priceCents: 1999, priceLabel: "$19.99", note: "225 + 75 bonus Ducats" },
  ];

  function packById(id) {
    return DUCAT_PACKS.find(function (p) { return p.id === id; }) || null;
  }

  function scopeKey(scopeId) {
    return scopeId ? String(scopeId) : "guest";
  }

  function emptyWallet() {
    return {
      balance: 0,
      unlocks: {},
      creatorEarned: 0,
      creatorPendingCashout: 0,
    };
  }

  function unlockKey(seriesId, episodeId) {
    return String(seriesId) + "::" + String(episodeId);
  }

  function readLocal(scopeId) {
    var key = STORAGE_PREFIX + scopeKey(scopeId);
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return emptyWallet();
      var data = JSON.parse(raw);
      return {
        balance: Math.max(0, parseInt(data.balance, 10) || 0),
        unlocks: data.unlocks && typeof data.unlocks === "object" ? data.unlocks : {},
        creatorEarned: Math.max(0, parseInt(data.creatorEarned, 10) || 0),
        creatorPendingCashout: Math.max(0, parseInt(data.creatorPendingCashout, 10) || 0),
      };
    } catch (e) {
      return emptyWallet();
    }
  }

  function writeLocal(scopeId, wallet) {
    var key = STORAGE_PREFIX + scopeKey(scopeId);
    try {
      localStorage.setItem(key, JSON.stringify({
        balance: wallet.balance,
        unlocks: wallet.unlocks,
        creatorEarned: wallet.creatorEarned,
        creatorPendingCashout: wallet.creatorPendingCashout,
      }));
    } catch (e) { /* quota */ }
  }

  function getWallet(scopeId) {
    var sk = scopeKey(scopeId);
    if (!cache[sk]) cache[sk] = readLocal(scopeId);
    return cache[sk];
  }

  function setWallet(scopeId, wallet) {
    cache[scopeKey(scopeId)] = wallet;
    writeLocal(scopeId, wallet);
  }

  function formatDucats(n) {
    n = Math.max(0, parseInt(n, 10) || 0);
    return n === 1 ? "1 Ducat" : n + " Ducats";
  }

  function formatDucatsShort(n) {
    n = Math.max(0, parseInt(n, 10) || 0);
    return n + " \u2666";
  }

  function formatUsdFromCents(cents) {
    cents = Math.max(0, parseInt(cents, 10) || 0);
    return "$" + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  }

  function creatorShareDucats(spent) {
    spent = Math.max(0, parseInt(spent, 10) || 0);
    return Math.floor(spent * ECONOMICS.CREATOR_SHARE);
  }

  function cashoutUsdCents(earnedDucats) {
    earnedDucats = Math.max(0, parseInt(earnedDucats, 10) || 0);
    return earnedDucats * ECONOMICS.PAYOUT_USD_CENTS_PER_DUCAT;
  }

  function supabaseClient() {
    return window.ScenaAuth && ScenaAuth.getClient ? ScenaAuth.getClient() : null;
  }

  function isSignedIn(scopeId) {
    return Boolean(scopeId && scopeId !== "guest");
  }

  function applySnapshot(scopeId, row) {
    row = row || {};
    var wallet = {
      balance: Math.max(0, parseInt(row.balance, 10) || 0),
      unlocks: {},
      creatorEarned: Math.max(0, parseInt(row.creator_earned, 10) || 0),
      creatorPendingCashout: Math.max(0, parseInt(row.pending_cashout_ducats, 10) || 0),
    };
    (row.unlocks || []).forEach(function (u) {
      if (u.series_id && u.episode_id) {
        wallet.unlocks[unlockKey(u.series_id, u.episode_id)] = true;
      }
    });
    setWallet(scopeId, wallet);
    return wallet;
  }

  window.ScenaWallet = {
    ECONOMICS: ECONOMICS,
    CURRENCY_NAME: "Ducats",
    CURRENCY_SINGULAR: "Ducat",
    PACKS: DUCAT_PACKS,

    formatDucats: formatDucats,
    formatDucatsShort: formatDucatsShort,
    formatUsdFromCents: formatUsdFromCents,
    packById: packById,
    creatorShareDucats: creatorShareDucats,
    cashoutUsdCents: cashoutUsdCents,

    getBalance: function (scopeId) {
      return getWallet(scopeId).balance;
    },

    getCreatorEarned: function (scopeId) {
      return getWallet(scopeId).creatorEarned;
    },

    hasUnlock: function (scopeId, seriesId, episodeId) {
      if (!seriesId || !episodeId) return false;
      return Boolean(getWallet(scopeId).unlocks[unlockKey(seriesId, episodeId)]);
    },

    load: function (scopeId) {
      if (!isSignedIn(scopeId)) {
        return Promise.resolve(getWallet(scopeId));
      }
      var sb = supabaseClient();
      if (!sb) return Promise.resolve(getWallet(scopeId));

      return sb.rpc("wallet_snapshot").then(function (res) {
        if (res.error) {
          console.warn("wallet_snapshot:", res.error.message);
          return getWallet(scopeId);
        }
        return applySnapshot(scopeId, res.data || {});
      }).catch(function () {
        return getWallet(scopeId);
      });
    },

    purchasePack: function (scopeId, packId) {
      var pack = packById(packId);
      if (!pack) return Promise.reject(new Error("Unknown Ducat pack."));
      if (!isSignedIn(scopeId)) {
        return Promise.reject(new Error("Sign in to buy Ducats."));
      }

      var sb = supabaseClient();
      if (!sb) {
        var wallet = getWallet(scopeId);
        wallet.balance += pack.ducats;
        setWallet(scopeId, wallet);
        return Promise.resolve({ balance: wallet.balance, beta: true });
      }

      return sb.rpc("purchase_ducat_pack", { p_pack_id: packId }).then(function (res) {
        if (res.error) throw new Error(res.error.message || "Purchase failed.");
        return ScenaWallet.load(scopeId).then(function (w) {
          return { balance: w.balance };
        });
      });
    },

    unlockChapter: function (scopeId, seriesId, episodeId, cost, creatorId) {
      cost = Math.max(0, parseInt(cost, 10) || 0);
      if (!cost) return Promise.resolve({ ok: true, free: true });
      if (!seriesId || !episodeId) return Promise.reject(new Error("Missing chapter."));
      if (!isSignedIn(scopeId)) {
        return Promise.reject(new Error("Sign in to unlock chapters with Ducats."));
      }

      var wallet = getWallet(scopeId);
      if (wallet.unlocks[unlockKey(seriesId, episodeId)]) {
        return Promise.resolve({ ok: true, already: true, balance: wallet.balance });
      }
      if (wallet.balance < cost) {
        return Promise.reject(new Error("Not enough Ducats. You need " + formatDucats(cost) + "."));
      }

      var sb = supabaseClient();
      if (!sb) {
        wallet.balance -= cost;
        wallet.unlocks[unlockKey(seriesId, episodeId)] = true;
        if (creatorId && creatorId !== scopeId) {
          /* local demo: no cross-user credit */
        }
        setWallet(scopeId, wallet);
        return Promise.resolve({ ok: true, balance: wallet.balance, beta: true });
      }

      return sb.rpc("unlock_chapter_with_ducats", {
        p_series_id: seriesId,
        p_episode_id: episodeId,
        p_cost: cost,
        p_creator_id: creatorId || null,
      }).then(function (res) {
        if (res.error) throw new Error(res.error.message || "Unlock failed.");
        return ScenaWallet.load(scopeId).then(function (w) {
          return { ok: true, balance: w.balance };
        });
      });
    },

    spendBalance: function (scopeId, amount, reason) {
      amount = Math.max(0, parseInt(amount, 10) || 0);
      if (!amount) return Promise.resolve({ balance: getWallet(scopeId).balance });
      if (!isSignedIn(scopeId)) {
        return Promise.reject(new Error("Sign in to spend Ducats."));
      }
      var wallet = getWallet(scopeId);
      if (wallet.balance < amount) {
        return Promise.reject(new Error("Not enough Ducats. You need " + formatDucats(amount) + "."));
      }
      wallet.balance -= amount;
      setWallet(scopeId, wallet);
      return Promise.resolve({ balance: wallet.balance, reason: reason || "spend", beta: true });
    },

    creditBalance: function (scopeId, amount, reason) {
      amount = Math.max(0, parseInt(amount, 10) || 0);
      if (!amount) return Promise.resolve({ balance: getWallet(scopeId).balance });
      if (!isSignedIn(scopeId)) {
        return Promise.reject(new Error("Sign in to receive Ducats."));
      }
      var wallet = getWallet(scopeId);
      wallet.balance += amount;
      setWallet(scopeId, wallet);
      return Promise.resolve({ balance: wallet.balance, reason: reason || "credit", beta: true });
    },

    requestCashout: function (scopeId, ducats) {
      ducats = Math.max(0, parseInt(ducats, 10) || 0);
      if (!isSignedIn(scopeId)) {
        return Promise.reject(new Error("Sign in to cash out."));
      }
      if (ducats < ECONOMICS.MIN_CASHOUT_DUCATS) {
        return Promise.reject(new Error(
          "Minimum cash-out is " + formatDucats(ECONOMICS.MIN_CASHOUT_DUCATS) +
          " (" + formatUsdFromCents(cashoutUsdCents(ECONOMICS.MIN_CASHOUT_DUCATS)) + ")."
        ));
      }

      var sb = supabaseClient();
      if (!sb) {
        var wallet = getWallet(scopeId);
        if (wallet.creatorEarned < ducats) {
          return Promise.reject(new Error("Not enough earned Ducats."));
        }
        wallet.creatorEarned -= ducats;
        wallet.creatorPendingCashout += ducats;
        setWallet(scopeId, wallet);
        return Promise.resolve({
          ok: true,
          usdCents: cashoutUsdCents(ducats),
          beta: true,
        });
      }

      return sb.rpc("request_creator_cashout", { p_ducats: ducats }).then(function (res) {
        if (res.error) throw new Error(res.error.message || "Cash-out failed.");
        return ScenaWallet.load(scopeId).then(function () {
          var row = res.data || {};
          return {
            ok: true,
            usdCents: row.usd_cents || cashoutUsdCents(ducats),
            status: row.status || "pending",
          };
        });
      });
    },

    renderPackGrid: function (opts) {
      opts = opts || {};
      var btnClass = opts.buttonClass || "btn btn-sm btn-secondary ducat-pack-btn";
      return (
        '<div class="ducat-pack-grid">' +
        DUCAT_PACKS.map(function (pack) {
          var perDucat = pack.priceCents / pack.ducats;
          return (
            '<button type="button" class="' + btnClass + '" data-ducat-pack="' + pack.id + '">' +
              '<span class="ducat-pack-amount">' + formatDucats(pack.ducats) + "</span>" +
              '<span class="ducat-pack-price">' + pack.priceLabel + "</span>" +
              '<span class="ducat-pack-note">' + (pack.note || formatUsdFromCents(Math.round(perDucat)) + " each") + "</span>" +
            "</button>"
          );
        }).join("") +
        "</div>"
      );
    },

    renderEconomicsHint: function () {
      return (
        '<p class="field-hint wallet-economics-hint">' +
        "When readers unlock your paid chapters, you earn " +
        Math.round(ECONOMICS.CREATOR_SHARE * 100) +
        "% of the Ducats they spend. Cash out earned Ducats at " +
        formatUsdFromCents(ECONOMICS.PAYOUT_USD_CENTS_PER_DUCAT) +
        " each (minimum " + formatDucats(ECONOMICS.MIN_CASHOUT_DUCATS) + ")." +
        "</p>"
      );
    },

    bindPackButtons: function (root, scopeId, onSuccess, onError) {
      if (!root) return;
      root.querySelectorAll("[data-ducat-pack]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var packId = btn.getAttribute("data-ducat-pack");
          btn.disabled = true;
          ScenaWallet.purchasePack(scopeId, packId)
            .then(function (result) {
              btn.disabled = false;
              if (onSuccess) onSuccess(result);
            })
            .catch(function (err) {
              btn.disabled = false;
              if (onError) onError(err);
            });
        });
      });
    },
  };
})();

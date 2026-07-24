/**

 * Arleco — Ducats (virtual currency), chapter unlocks, creator earnings & cash-out.

 *

 * Production: all signed-in wallet operations go through Supabase RPCs.

 * Purchases use Stripe Checkout → webhook → grant_ducat_pack_from_stripe (no free grants).

 * See docs/MONETIZATION.md and docs/STRIPE_SETUP.md.

 */

(function () {

  var STORAGE_PREFIX = "arleco_wallet_";

  var cache = {};



  var ECONOMICS = {

    CREATOR_SHARE: 0.7,

    REFERENCE_RETAIL_CENTS_PER_DUCAT: 4,

    CASHOUT_RATIO: 0.7,

    MIN_CASHOUT_DUCATS: 500,

    PLATFORM_NAME: "Arleco",

  };



  var DUCAT_PACKS = [

    { id: "ducat_10", ducats: 10, priceCents: 99, priceLabel: "$0.99", note: "Try a chapter" },

    { id: "ducat_55", ducats: 55, priceCents: 499, priceLabel: "$4.99", note: "50 + 5 bonus Ducats" },

    { id: "ducat_120", ducats: 120, priceCents: 999, priceLabel: "$9.99", note: "100 + 20 bonus — popular" },

    { id: "ducat_500", ducats: 500, priceCents: 2499, priceLabel: "$24.99", note: "500 Ducats — best per-chapter value" },

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

    try {

      localStorage.setItem(STORAGE_PREFIX + scopeKey(scopeId), JSON.stringify({

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



  function setCache(scopeId, wallet) {

    cache[scopeKey(scopeId)] = wallet;

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



  function payoutCentsPerDucat() {

    return ECONOMICS.REFERENCE_RETAIL_CENTS_PER_DUCAT * ECONOMICS.CASHOUT_RATIO;

  }



  function cashoutUsdCents(earnedDucats) {

    earnedDucats = Math.max(0, parseInt(earnedDucats, 10) || 0);

    return Math.floor(earnedDucats * payoutCentsPerDucat());

  }



  function supabaseClient() {

    return window.ScenaAuth && ScenaAuth.getClient ? ScenaAuth.getClient() : null;

  }



  function isSignedIn(scopeId) {

    return Boolean(scopeId && scopeId !== "guest");

  }



  function cloudRequired(scopeId) {

    if (!isSignedIn(scopeId)) return Promise.reject(new Error("Sign in to use Ducats."));

    if (!supabaseClient()) {

      return Promise.reject(new Error("Ducats require cloud sign-in — configure Supabase on this site."));

    }

    return Promise.resolve();

  }

  function ensureProfileRow(sb, scopeId) {
    return sb.rpc("ensure_auth_profile").then(function (res) {
      if (!res.error) return;
      if (!/does not exist/i.test(res.error.message || "")) {
        throw new Error(res.error.message || "Could not ensure profile.");
      }
      return sb.from("profiles").select("id").eq("id", scopeId).maybeSingle().then(function (row) {
        if (row.data) return;
        var email = "";
        var displayName = "Reader";
        if (window.ScenaAuth && ScenaAuth.getSession) {
          return ScenaAuth.getSession().then(function (session) {
            if (session && session.user) {
              email = session.user.email || "";
              displayName =
                (session.user.user_metadata && session.user.user_metadata.display_name) ||
                (email ? email.split("@")[0] : "Reader");
            }
            return sb.from("profiles").insert({
              id: scopeId,
              email: email || null,
              display_name: displayName,
              intended_role: "reader",
            });
          });
        }
        return sb.from("profiles").insert({
          id: scopeId,
          email: null,
          display_name: displayName,
          intended_role: "reader",
        });
      });
    });
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

    setCache(scopeId, wallet);

    return wallet;

  }



  function currentReturnPath() {

    var path = window.location.pathname || "/";

    var hash = window.location.hash || "";

    return path + hash;

  }



  function handlePurchaseReturn(scopeId) {

    try {

      var params = new URLSearchParams(window.location.search);

      if (params.get("ducat_purchase") === "success") {

        params.delete("ducat_purchase");

        params.delete("session_id");

        var qs = params.toString();

        var next = window.location.pathname + (qs ? "?" + qs : "") + (window.location.hash || "");

        window.history.replaceState({}, "", next);

        return ScenaWallet.load(scopeId).then(function () {

          return { purchased: true };

        });

      }

      if (params.get("ducat_purchase") === "cancelled") {

        params.delete("ducat_purchase");

        var qs2 = params.toString();

        window.history.replaceState({}, "", window.location.pathname + (qs2 ? "?" + qs2 : "") + (window.location.hash || ""));

      }

    } catch (e) { /* ignore */ }

    return Promise.resolve(null);

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

    payoutCentsPerDucat: payoutCentsPerDucat,

    referenceRetailCentsPerDucat: function () {

      return ECONOMICS.REFERENCE_RETAIL_CENTS_PER_DUCAT;

    },



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

      var purchaseMeta = null;

      return handlePurchaseReturn(scopeId).then(function (meta) {

        purchaseMeta = meta;

        return cloudRequired(scopeId);

      }).then(function () {

        var sb = supabaseClient();

        return ensureProfileRow(sb, scopeId).then(function () {

          return sb.rpc("wallet_snapshot").then(function (res) {

            if (res.error) throw new Error(res.error.message || "Could not load wallet.");

            var wallet = applySnapshot(scopeId, res.data || {});

            if (purchaseMeta && purchaseMeta.purchased) wallet.purchased = true;

            return wallet;

          });

        });

      });

    },



    /** Redirects to Stripe Checkout — Ducats credit after webhook confirms payment. */

    purchasePack: function (scopeId, packId) {

      var pack = packById(packId);

      if (!pack) return Promise.reject(new Error("Unknown Ducat pack."));

      return cloudRequired(scopeId).then(function () {

        var sb = supabaseClient();

        return ensureProfileRow(sb, scopeId).then(function () {

          return sb.functions.invoke("create-ducat-checkout", {

          body: {

            packId: packId,

            returnUrl: window.location.origin,

            returnPath: currentReturnPath(),

          },

        }).then(function (res) {

          var data = res.data;

          if (typeof data === "string") {

            try { data = JSON.parse(data); } catch (e) { data = {}; }

          }

          data = data || {};

          if (data.error) throw new Error(String(data.error));

          if (res.error) {

            var msg = res.error.message || "Checkout failed.";

            if (/not found|404|Failed to send/i.test(msg)) {

              msg = "Ducat checkout is not deployed yet. Finish Stripe setup in docs/STRIPE_SETUP.md (Edge Function create-ducat-checkout).";

            }

            throw new Error(msg);

          }

          if (!data.url) throw new Error("Checkout did not return a payment URL. Is Stripe configured in Supabase secrets?");

          window.location.assign(data.url);

          return { redirecting: true };

        });

        });

      });

    },



    unlockChapter: function (scopeId, seriesId, episodeId, cost, creatorId) {

      cost = Math.max(0, parseInt(cost, 10) || 0);

      if (!cost) return Promise.resolve({ ok: true, free: true });

      if (!seriesId || !episodeId) return Promise.reject(new Error("Missing chapter."));



      var wallet = getWallet(scopeId);

      if (wallet.unlocks[unlockKey(seriesId, episodeId)]) {

        return Promise.resolve({ ok: true, already: true, balance: wallet.balance });

      }



      return cloudRequired(scopeId).then(function () {

        var sb = supabaseClient();

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

      });

    },



    spendBalance: function (scopeId, amount, reason, refId) {

      amount = Math.max(0, parseInt(amount, 10) || 0);

      if (!amount) return Promise.resolve({ balance: getWallet(scopeId).balance });

      return cloudRequired(scopeId).then(function () {

        var sb = supabaseClient();

        return ensureProfileRow(sb, scopeId).then(function () {

          return sb.rpc("wallet_spend_balance", {

          p_amount: amount,

          p_reason: reason || "spend",

          p_ref_id: refId || null,

        }).then(function (res) {

          if (res.error) throw new Error(res.error.message || "Could not spend Ducats.");

          return ScenaWallet.load(scopeId).then(function () {

            var row = res.data || {};

            return { balance: row.balance, spent: amount };

          });

        });

      });

      });

    },



    /** Prize payouts to jam winners (host only; pool tracked in ducat_ledger). */
    jamPayoutWinner: function (hostUserId, jamId, winnerUserId, amount) {
      amount = Math.max(0, parseInt(amount, 10) || 0);
      if (!amount || !jamId || !winnerUserId) {
        return Promise.reject(new Error("Missing jam payout details."));
      }
      return cloudRequired(hostUserId).then(function () {
        var sb = supabaseClient();
        return sb.rpc("jam_payout_winner", {
          p_jam_id: String(jamId),
          p_winner_user_id: winnerUserId,
          p_amount: amount,
        }).then(function (res) {
          if (res.error) throw new Error(res.error.message || "Could not pay jam prize.");
          return res.data || {};
        });
      });
    },

    checkBalance: function (scopeId, needed) {
      needed = Math.max(0, parseInt(needed, 10) || 0);
      return ScenaWallet.load(scopeId).then(function () {
        var have = ScenaWallet.getBalance(scopeId);
        if (needed > have) {
          var err = new Error(
            "You need " + formatDucats(needed) + " but only have " + formatDucats(have) + "."
          );
          err.code = "NEED_DUCATS";
          err.need = needed;
          err.have = have;
          throw err;
        }
        return { balance: have, ok: true };
      });
    },

    renderBuyDucatsPanel: function (opts) {
      opts = opts || {};
      var hint = opts.message || "Buy Ducats to fund this jam prize.";
      return (
        '<div class="ducat-buy-panel">' +
          '<p class="field-hint">' + hint + "</p>" +
          ScenaWallet.renderPackGrid({ buttonClass: "btn btn-sm btn-secondary ducat-pack-btn" }) +
          '<p class="field-hint"><a href="#/library/shop">Open Ducat shop</a></p>' +
        "</div>"
      );
    },

    /** Prize payouts to other users require server-side jam settlement (not browser-callable). */
    creditBalance: function (scopeId, amount, reason) {

      amount = Math.max(0, parseInt(amount, 10) || 0);

      if (!amount) return Promise.resolve({ balance: getWallet(scopeId).balance });

      return Promise.reject(new Error("Use jamPayoutWinner for prize payouts."));
    },



    requestCashout: function (scopeId, ducats) {

      ducats = Math.max(0, parseInt(ducats, 10) || 0);

      if (ducats < ECONOMICS.MIN_CASHOUT_DUCATS) {

        return Promise.reject(new Error(

          "Minimum cash-out is " + formatDucats(ECONOMICS.MIN_CASHOUT_DUCATS) +

          " (" + formatUsdFromCents(cashoutUsdCents(ECONOMICS.MIN_CASHOUT_DUCATS)) + ")."

        ));

      }

      return cloudRequired(scopeId).then(function () {

        var sb = supabaseClient();

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

      });

    },



    renderPackGrid: function (opts) {

      opts = opts || {};

      var btnClass = opts.buttonClass || "btn btn-sm btn-secondary ducat-pack-btn";

      return (

        '<div class="ducat-pack-grid">' +

        DUCAT_PACKS.map(function (pack) {

          return (

            '<button type="button" class="' + btnClass + '" data-ducat-pack="' + pack.id + '">' +

              '<span class="ducat-pack-amount">' + formatDucats(pack.ducats) + "</span>" +

              '<span class="ducat-pack-price">' + pack.priceLabel + "</span>" +

              '<span class="ducat-pack-note">' + (pack.note || "") + "</span>" +

            "</button>"

          );

        }).join("") +

        "</div>"

      );

    },



    renderEconomicsHint: function () {

      var payoutPer = payoutCentsPerDucat();

      var payoutLabel = "$" + (payoutPer / 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");

      return (

        '<p class="field-hint wallet-economics-hint">' +

        "Ducats are purchased securely via Stripe. When readers spend on your work, you earn " +

        Math.round(ECONOMICS.CREATOR_SHARE * 100) +

        "% as earned Ducats. Cash out at " + payoutLabel + " each (min " +

        formatDucats(ECONOMICS.MIN_CASHOUT_DUCATS) + " = " +

        formatUsdFromCents(cashoutUsdCents(ECONOMICS.MIN_CASHOUT_DUCATS)) + "). " +

        "Purchased balance cannot be sold back for USD." +

        "</p>"

      );

    },



    bindPackButtons: function (root, scopeId, onSuccess, onError) {

      if (!root) return;

      root.querySelectorAll("[data-ducat-pack]").forEach(function (btn) {

        btn.addEventListener("click", function () {

          var packId = btn.getAttribute("data-ducat-pack");

          btn.disabled = true;
          btn.textContent = "Opening checkout…";

          ScenaWallet.purchasePack(scopeId, packId)

            .then(function (result) {

              if (!result || !result.redirecting) btn.disabled = false;

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



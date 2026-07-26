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

    /** Share of each Ducat spend credited to the creator (80% — platform keeps 20%). */
    CREATOR_SHARE: 0.8,

    /** Reference buy rate from the $0.99 / 10 loss-leader pack (~$0.09/Ducat). */
    MARKET_RATE_CENTS_PER_DUCAT: 9,

    /** USD paid per earned Ducat at cash-out (only earned Ducats convert). */
    CASHOUT_CENTS_PER_DUCAT: 5,

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

    return ECONOMICS.CASHOUT_CENTS_PER_DUCAT;

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

  function rpcMissingError(msg) {
    msg = String(msg || "");
    return /does not exist|could not find the function|schema cache|PGRST202/i.test(msg);
  }

  function ensureProfileRow(sb, scopeId) {
    return sb.rpc("ensure_auth_profile").then(function (res) {
      if (!res.error) return;
      if (!rpcMissingError(res.error.message)) {
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



  function purchaseReturnQuery() {

    var searchParams = new URLSearchParams(window.location.search);

    if (searchParams.get("ducat_purchase")) {

      return { params: searchParams, inHash: false };

    }

    var hash = window.location.hash || "";

    var qIdx = hash.indexOf("?");

    if (qIdx >= 0) {

      return {

        params: new URLSearchParams(hash.slice(qIdx + 1)),

        inHash: true,

        hashBeforeQuery: hash.slice(0, qIdx),

      };

    }

    return { params: new URLSearchParams(), inHash: false };

  }



  function handlePurchaseReturn(scopeId) {

    try {

      var parsed = purchaseReturnQuery();

      var params = parsed.params;

      if (params.get("ducat_purchase") === "success") {

        var sessionId = params.get("session_id") || "";

        params.delete("ducat_purchase");

        params.delete("session_id");

        var qs = params.toString();

        if (parsed.inHash) {

          var nextHash = parsed.hashBeforeQuery + (qs ? "?" + qs : "");

          window.history.replaceState({}, "", window.location.pathname + window.location.search + nextHash);

        } else {

          var next = window.location.pathname + (qs ? "?" + qs : "") + (window.location.hash || "");

          window.history.replaceState({}, "", next);

        }

        return Promise.resolve({ purchased: true, sessionId: sessionId });

      }

      if (params.get("ducat_purchase") === "cancelled") {

        params.delete("ducat_purchase");

        var qs2 = params.toString();

        if (parsed.inHash) {

          window.history.replaceState({}, "", window.location.pathname + window.location.search + parsed.hashBeforeQuery + (qs2 ? "?" + qs2 : ""));

        } else {

          window.history.replaceState({}, "", window.location.pathname + (qs2 ? "?" + qs2 : "") + (window.location.hash || ""));

        }

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

      return ECONOMICS.MARKET_RATE_CENTS_PER_DUCAT;

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

        var confirmPromise = Promise.resolve(null);

        if (purchaseMeta && purchaseMeta.sessionId && sb && sb.functions && sb.functions.invoke) {

          confirmPromise = sb.functions.invoke("confirm-ducat-checkout", {

            body: { sessionId: purchaseMeta.sessionId },

          }).then(function (res) {

            if (res.error) {

              console.warn("confirm-ducat-checkout:", res.error.message || res.error);

            }

            return res.data;

          }).catch(function (err) {

            console.warn("confirm-ducat-checkout:", err && err.message ? err.message : err);

            return null;

          });

        }

        return confirmPromise.then(function () {

          return ensureProfileRow(sb, scopeId).then(function () {

            return sb.rpc("wallet_snapshot").then(function (res) {

              if (res.error) throw new Error(res.error.message || "Could not load wallet.");

              var wallet = applySnapshot(scopeId, res.data || {});

              if (purchaseMeta && purchaseMeta.purchased) wallet.purchased = true;

              return wallet;

            });

          });

        });

      }).catch(function (err) {

        console.warn("ScenaWallet.load:", err && err.message ? err.message : err);

        return getWallet(scopeId);

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

            if (res.error.context && res.error.context.body) {

              try {

                var errBody = typeof res.error.context.body === "string"

                  ? JSON.parse(res.error.context.body)

                  : res.error.context.body;

                if (errBody && errBody.error) msg = String(errBody.error);

              } catch (parseErr) { /* keep msg */ }

            }

            if (/not found|404|Failed to send/i.test(msg)) {

              msg = "Ducat checkout is not deployed yet. Finish Stripe setup in docs/STRIPE_SETUP.md (Edge Function create-ducat-checkout).";

            } else if (/non-2xx/i.test(msg)) {

              msg = "Checkout server error. In Supabase → Edge Functions → create-ducat-checkout → Logs. Usually: STRIPE_SECRET_KEY secret missing/wrong (use sk_live_… for live), or function needs redeploy after adding secrets.";

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

      var marketPer = ECONOMICS.MARKET_RATE_CENTS_PER_DUCAT / 100;
      var payoutPer = payoutCentsPerDucat() / 100;
      var marketLabel = "$" + marketPer.toFixed(2);
      var payoutLabel = "$" + payoutPer.toFixed(2);
      var platformPct = Math.round((1 - ECONOMICS.CREATOR_SHARE) * 100);
      var creatorPct = Math.round(ECONOMICS.CREATOR_SHARE * 100);

      return (

        '<p class="field-hint wallet-economics-hint">' +

        "When readers spend Ducats on your chapters or marketplace listings, you earn " +
        creatorPct + "% as <strong>earned Ducats</strong> (" + platformPct + "% stays with " +
        ECONOMICS.PLATFORM_NAME + " as platform share). Earned Ducats cash out at " +
        payoutLabel + " each (reference buy rate ~" + marketLabel + " via packs). Minimum cash-out: " +

        formatDucats(ECONOMICS.MIN_CASHOUT_DUCATS) + " = " +

        formatUsdFromCents(cashoutUsdCents(ECONOMICS.MIN_CASHOUT_DUCATS)) + ". " +

        "Purchased wallet balance cannot be exchanged for USD." +

        "</p>"

      );

    },

    renderWalletPanel: function (scopeId) {

      var balance = ScenaWallet.getBalance(scopeId);

      var earned = ScenaWallet.getCreatorEarned(scopeId);

      var payoutPer = payoutCentsPerDucat();

      var payoutLabel = "$" + (payoutPer / 100).toFixed(2);

      var earnedUsd = formatUsdFromCents(cashoutUsdCents(earned));

      var canCashout = earned >= ECONOMICS.MIN_CASHOUT_DUCATS;

      return (

        '<section class="form-section wallet-panel" id="accountWalletPanel">' +

          "<h2>Ducats</h2>" +

          '<div class="wallet-balances">' +

            '<div class="wallet-balance-card">' +

              "<span class=\"wallet-balance-label\">Spending balance</span>" +

              '<strong class="wallet-balance-value">' + balance.toLocaleString() + "</strong>" +

              "<span class=\"field-hint\">For chapters, marketplace, and jam entries</span>" +

            "</div>" +

            '<div class="wallet-balance-card wallet-balance-card--earned">' +

              "<span class=\"wallet-balance-label\">Earned Ducats</span>" +

              '<strong class="wallet-balance-value">' + earned.toLocaleString() + "</strong>" +

              '<span class="field-hint">Cash-out eligible · ~' + earnedUsd + " at " + payoutLabel + "/Ducat</span>" +

            "</div>" +

          "</div>" +

          ScenaWallet.renderEconomicsHint() +

          '<div class="wallet-actions">' +

            '<div class="field"><label>Cash out earned Ducats</label>' +

              '<input type="number" id="walletCashoutAmount" min="' + ECONOMICS.MIN_CASHOUT_DUCATS +

              '" step="1" value="' + (canCashout ? String(ECONOMICS.MIN_CASHOUT_DUCATS) : "") +

              '" placeholder="Min ' + ECONOMICS.MIN_CASHOUT_DUCATS + '"' +

              (canCashout ? "" : " disabled") + ">" +

              '<p class="field-hint">Only earned Ducats convert to USD — not your spending balance.</p></div>' +

            '<button type="button" class="btn btn-secondary" id="walletCashoutBtn"' +

              (canCashout ? "" : " disabled") + ">Request cash-out</button>" +

          "</div>" +

          "<h3 class=\"wallet-buy-heading\">Buy more Ducats</h3>" +

          ScenaWallet.renderPackGrid({ buttonClass: "btn btn-sm btn-secondary ducat-pack-btn" }) +

        "</section>"

      );

    },

    bindWalletPanel: function (root, scopeId, onChange) {

      if (!root || !scopeId) return;

      ScenaWallet.bindPackButtons(root, scopeId, function () {

        if (onChange) onChange();

      }, function (err) {

        if (onChange) onChange(err && err.message);

      });

      var cashoutBtn = root.querySelector("#walletCashoutBtn");

      var cashoutInput = root.querySelector("#walletCashoutAmount");

      if (cashoutBtn) {

        cashoutBtn.addEventListener("click", function () {

          var amount = cashoutInput ? parseInt(cashoutInput.value, 10) : ECONOMICS.MIN_CASHOUT_DUCATS;

          cashoutBtn.disabled = true;

          ScenaWallet.requestCashout(scopeId, amount).then(function () {

            if (onChange) onChange("Cash-out request submitted.");

          }).catch(function (err) {

            if (onChange) onChange((err && err.message) || "Cash-out failed.");

          }).finally(function () {

            cashoutBtn.disabled = false;

          });

        });

      }

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



/**
 * Arleco — platform admin + user content reports.
 */
(function () {
  function getClient() {
    return window.ScenaAuth && ScenaAuth.getClient ? ScenaAuth.getClient() : null;
  }

  function mapSeriesRow(row) {
    if (!row) return null;
    return {
      seriesId: row.series_id,
      ownerId: row.owner_id,
      title: row.title || "Untitled",
      description: row.description || "",
      thumbnailDataUrl: row.thumbnail_data_url || "",
      bannerDataUrl: row.banner_data_url || "",
      featured: !!row.featured,
      featuredOrder: row.featured_order != null ? parseInt(row.featured_order, 10) : null,
      featuredEyebrow: row.featured_eyebrow || "",
      liveChapterCount: parseInt(row.live_chapter_count, 10) || 0,
      adminHidden: !!row.admin_hidden,
      adminHiddenReason: row.admin_hidden_reason || "",
      updatedAt: row.updated_at || "",
    };
  }

  window.ScenaAdmin = {
    isAdmin: function (profile) {
      return !!(profile && profile.isAdmin);
    },

    submitReport: function (opts) {
      opts = opts || {};
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Sign in to report content."));
      return sb.rpc("submit_content_report", {
        p_target_type: opts.targetType,
        p_target_id: opts.targetId,
        p_reason: opts.reason || "",
        p_details: opts.details || "",
        p_target_meta: opts.targetMeta || {},
      }).then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
    },

    listPublishedSeries: function () {
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not configured."));
      return sb.rpc("admin_list_published_series").then(function (result) {
        if (result.error) throw result.error;
        return (result.data || []).map(mapSeriesRow).filter(Boolean);
      });
    },

    setSeriesFeatured: function (opts) {
      opts = opts || {};
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not configured."));
      return sb.rpc("admin_set_series_featured", {
        p_owner_id: opts.ownerId,
        p_series_id: opts.seriesId,
        p_featured: !!opts.featured,
        p_featured_order: opts.featuredOrder != null ? parseInt(opts.featuredOrder, 10) : null,
        p_featured_eyebrow: opts.featuredEyebrow || null,
      }).then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
    },

    listRecentComments: function (limit) {
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not configured."));
      return sb.rpc("admin_list_recent_comments", { p_limit: limit || 80 }).then(function (result) {
        if (result.error) throw result.error;
        return (result.data || []).map(function (row) {
          return {
            commentId: row.comment_id,
            seriesId: row.series_id,
            episodeId: row.episode_id,
            userId: row.user_id,
            authorName: row.author_name || "Reader",
            body: row.body || "",
            createdAt: row.created_at,
            hiddenAt: row.hidden_at,
            hiddenReason: row.hidden_reason || "",
          };
        });
      });
    },

    hideComment: function (commentId, reason) {
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not configured."));
      return sb.rpc("admin_hide_comment", {
        p_comment_id: commentId,
        p_reason: reason || "",
      }).then(function (result) {
        if (result.error) throw result.error;
      });
    },

    unhideComment: function (commentId) {
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not configured."));
      return sb.rpc("admin_unhide_comment", { p_comment_id: commentId }).then(function (result) {
        if (result.error) throw result.error;
      });
    },

    setSeriesModeration: function (opts) {
      opts = opts || {};
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not configured."));
      return sb.rpc("admin_set_series_moderation", {
        p_owner_id: opts.ownerId,
        p_series_id: opts.seriesId,
        p_hidden: !!opts.hidden,
        p_reason: opts.reason || "",
        p_clear_descriptions: !!opts.clearDescriptions,
      }).then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
    },

    listGameJams: function (limit) {
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not configured."));
      return sb.rpc("admin_list_game_jams", { p_limit: limit || 80 }).then(function (result) {
        if (result.error) throw result.error;
        return (result.data || []).map(function (row) {
          return {
            jamId: row.jam_id,
            hostUserId: row.host_user_id,
            hostName: row.host_name || "Host",
            title: row.title || "Untitled jam",
            tagline: row.tagline || "",
            rules: row.rules || "",
            status: row.status || "draft",
            submissionCount: parseInt(row.submission_count, 10) || 0,
            hiddenAt: row.hidden_at,
            hiddenReason: row.hidden_reason || "",
            updatedAt: row.updated_at,
          };
        });
      });
    },

    hideGameJam: function (jamId, reason) {
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not configured."));
      return sb.rpc("admin_hide_game_jam", {
        p_jam_id: jamId,
        p_reason: reason || "",
      }).then(function (result) {
        if (result.error) throw result.error;
      });
    },

    unhideGameJam: function (jamId) {
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not configured."));
      return sb.rpc("admin_unhide_game_jam", { p_jam_id: jamId }).then(function (result) {
        if (result.error) throw result.error;
      });
    },

    listMarketplaceListings: function (limit) {
      var sb = getClient();
      if (!sb) return Promise.resolve([]);
      return sb.rpc("admin_list_marketplace_listings", { p_limit: limit || 80 }).then(function (result) {
        if (result.error) {
          var msg = String(result.error.message || "");
          if (/marketplace_listings|does not exist|schema cache|PGRST/i.test(msg)) {
            return [];
          }
          throw result.error;
        }
        return (result.data || []).map(function (row) {
          return {
            listingId: row.listing_id,
            sellerId: row.seller_id,
            sellerName: row.seller_name || "Creator",
            title: row.title || "Untitled",
            description: row.description || "",
            category: row.category || "",
            status: row.status || "",
            updatedAt: row.updated_at,
          };
        });
      });
    },

    removeMarketplaceListing: function (listingId, reason) {
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not configured."));
      return sb.rpc("admin_remove_marketplace_listing", {
        p_listing_id: listingId,
        p_reason: reason || "",
      }).then(function (result) {
        if (result.error) throw result.error;
      });
    },

    listContentReports: function (limit) {
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not configured."));
      return sb.rpc("admin_list_content_reports", { p_limit: limit || 80 }).then(function (result) {
        if (result.error) throw result.error;
        return (result.data || []).map(function (row) {
          return {
            reportId: row.report_id,
            targetType: row.target_type,
            targetId: row.target_id,
            targetMeta: row.target_meta || {},
            reason: row.reason || "",
            details: row.details || "",
            status: row.status || "open",
            reporterName: row.reporter_name || "Reader",
            createdAt: row.created_at,
          };
        });
      });
    },

    resolveContentReport: function (reportId, status) {
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not configured."));
      return sb.rpc("admin_resolve_content_report", {
        p_report_id: reportId,
        p_status: status || "resolved",
      }).then(function (result) {
        if (result.error) throw result.error;
      });
    },
  };
})();

/**
 * JobXApply Privacy-Respecting Analytics & Telemetry Layer
 * 
 * Engineered to comply with GDPR, CCPA, and modern privacy standards:
 * - Zero third-party trackers or ad-network beacons
 * - Zero PII (Personally Identifiable Information) collection
 * - Zero tracking cookies
 * - Respects Do Not Track (DNT) and Global Privacy Control (GPC)
 */

(function (window) {
  'use strict';

  var isDntEnabled = function () {
    return (
      window.doNotTrack === '1' ||
      navigator.doNotTrack === '1' ||
      navigator.doNotTrack === 'yes' ||
      navigator.globalPrivacyControl === true
    );
  };

  var Analytics = {
    enabled: !isDntEnabled(),
    sessionId: null,

    init: function () {
      if (!this.enabled) {
        if (window.console && console.debug) {
          console.debug('[JobXApply Analytics] DNT/GPC detected. Analytics deactivated.');
        }
        return;
      }

      // Generate ephemeral in-memory session identifier (never written to cookies or disk)
      this.sessionId = 's_' + Math.random().toString(36).substring(2, 11);

      // Track initial page view
      this.trackPageView();

      // Listen for hash/history changes for client-side routing
      if (window.addEventListener) {
        window.addEventListener('popstate', function () {
          Analytics.trackPageView();
        });
      }
    },

    trackPageView: function (customPath) {
      if (!this.enabled) return;

      var path = customPath || window.location.pathname;
      var title = document.title || 'Untitled';

      this.dispatch('page_view', {
        path: path,
        title: title,
        referrer: document.referrer ? new URL(document.referrer, window.location.origin).hostname : null,
        timestamp: new Date().toISOString()
      });
    },

    trackEvent: function (action, category, label, value) {
      if (!this.enabled) return;

      this.dispatch('event', {
        action: action,
        category: category || 'general',
        label: label || null,
        value: typeof value === 'number' ? value : null,
        timestamp: new Date().toISOString()
      });
    },

    trackToolUse: function (toolName, detail) {
      if (!this.enabled) return;

      this.dispatch('tool_interaction', {
        tool: toolName,
        detail: detail || null,
        timestamp: new Date().toISOString()
      });
    },

    dispatch: function (type, payload) {
      // Dispatches a standardized DOM event for any configured first-party listeners
      var eventData = {
        type: type,
        session: this.sessionId,
        data: payload
      };

      try {
        var customEvt = new CustomEvent('jobxapply:telemetry', { detail: eventData });
        window.dispatchEvent(customEvt);
      } catch (e) {
        // Fallback for older DOM implementations
      }
    }
  };

  // Expose globally
  window.JobXApplyAnalytics = Analytics;

  // Auto-initialize if DOM is ready, or queue for DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      Analytics.init();
    });
  } else {
    Analytics.init();
  }
})(window);

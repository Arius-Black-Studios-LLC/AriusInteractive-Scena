/**
 * Scena — Key Item assets (inventory tokens stored in series.assets).
 */
(function (global) {
  var KIND = "keyItem";

  function ScenaKeyItem(spec) {
    spec = spec || {};
    this.id = spec.id || "";
    this.label = spec.label || "Untitled item";
    this.description = spec.description || "";
    this.hiddenFromPlayer = !!(spec.hiddenFromPlayer != null ? spec.hiddenFromPlayer : spec.hidden);
    this.hiddenFromInventory = !!spec.hiddenFromInventory;
    this.iconDataUrl = spec.iconDataUrl || spec.dataUrl || null;
  }

  ScenaKeyItem.KIND = KIND;

  ScenaKeyItem.fromAsset = function (asset) {
    if (!asset || asset.kind !== KIND) return null;
    return new ScenaKeyItem({
      id: asset.id,
      label: asset.label,
      description: asset.description,
      hiddenFromPlayer: asset.hiddenFromPlayer != null ? asset.hiddenFromPlayer : asset.hidden,
      hiddenFromInventory: asset.hiddenFromInventory,
      iconDataUrl: asset.dataUrl,
    });
  };

  ScenaKeyItem.prototype.toAsset = function () {
    return {
      id: this.id,
      kind: KIND,
      label: this.label,
      description: this.description || "",
      hiddenFromPlayer: !!this.hiddenFromPlayer,
      hiddenFromInventory: !!this.hiddenFromInventory,
      dataUrl: this.iconDataUrl || null,
    };
  };

  ScenaKeyItem.prototype.isVisibleToPlayer = function () {
    return !this.hiddenFromPlayer;
  };

  ScenaKeyItem.prototype.isVisibleInInventory = function () {
    return !this.hiddenFromPlayer && !this.hiddenFromInventory;
  };

  function iconsApi() {
    return global.ScenaKeyItemIcons || null;
  }

  ScenaKeyItem.listDefaultIcons = function () {
    var api = iconsApi();
    return api ? api.list() : [];
  };

  ScenaKeyItem.getDefaultIcon = function (id) {
    var api = iconsApi();
    return api ? api.get(id) : null;
  };

  ScenaKeyItem.defaultIconDataUrl = function (id) {
    var api = iconsApi();
    return api ? api.dataUrl(id) : null;
  };

  ScenaKeyItem.iconForLabel = function (label) {
    var api = iconsApi();
    return api ? api.forKeyword(label) : null;
  };

  global.ScenaKeyItem = ScenaKeyItem;
})(window);

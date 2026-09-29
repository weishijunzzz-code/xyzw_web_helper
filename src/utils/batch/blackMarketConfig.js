export const blackMarketItemCatalog = [
  { itemId: 1001, label: "招募令", defaultDiscount: 10 },
  { itemId: 1011, label: "普通鱼竿", defaultDiscount: 10 },
  { itemId: 1012, label: "黄金鱼竿", defaultDiscount: 7 },
  { itemId: 1013, label: "珍珠", defaultDiscount: 10 },
  { itemId: 1019, label: "盐锭", defaultDiscount: 10 },
  { itemId: 1020, label: "皮肤币", defaultDiscount: 10 },
  { itemId: 1021, label: "扫荡令", defaultDiscount: 10 },
  { itemId: 1022, label: "白玉", defaultDiscount: 10 },
  { itemId: 1023, label: "彩玉", defaultDiscount: 10 },
  { itemId: 2001, label: "木质宝箱", defaultDiscount: 10 },
  { itemId: 2002, label: "青铜宝箱", defaultDiscount: 10 },
  { itemId: 2003, label: "黄金宝箱", defaultDiscount: 10 },
  { itemId: 2004, label: "铂金宝箱", defaultDiscount: 10 },
  { itemId: 2005, label: "钻石宝箱", defaultDiscount: 10 },
];

const blackMarketItemCatalogMap = new Map(
  blackMarketItemCatalog.map((item) => [item.itemId, item]),
);

export const getBlackMarketCatalogItem = (itemId) =>
  blackMarketItemCatalogMap.get(Number(itemId)) || null;

export const createBlackMarketPurchaseEntry = (itemId = null) => {
  const catalogItem = getBlackMarketCatalogItem(itemId);

  return {
    itemId: catalogItem?.itemId ?? itemId,
    discount: catalogItem?.defaultDiscount ?? 10,
    note: catalogItem?.label ?? "",
  };
};

export const defaultBlackMarketPurchaseList = [
  createBlackMarketPurchaseEntry(2002),
  createBlackMarketPurchaseEntry(2003),
  createBlackMarketPurchaseEntry(2004),
  createBlackMarketPurchaseEntry(1012),
];

const toPositiveInteger = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const integer = Math.trunc(numeric);
  return integer > 0 ? integer : null;
};

const clampDiscount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 10;
  return Math.min(10, Math.max(1, Math.trunc(numeric)));
};

export const normalizeBlackMarketPurchaseList = (rawList = []) => {
  if (!Array.isArray(rawList)) return [];

  const merged = new Map();

  rawList.forEach((entry) => {
    const itemId = toPositiveInteger(entry?.itemId);
    if (!itemId) return;

    const catalogItem = getBlackMarketCatalogItem(itemId);

    merged.set(itemId, {
      itemId,
      discount: clampDiscount(
        entry?.discount ?? catalogItem?.defaultDiscount ?? 10,
      ),
      note:
        typeof entry?.note === "string" && entry.note.trim()
          ? entry.note.trim()
          : catalogItem?.label || "",
    });
  });

  return [...merged.values()].sort((left, right) => left.itemId - right.itemId);
};

export const toStorePurchaseItemList = (rawList = []) =>
  normalizeBlackMarketPurchaseList(rawList).map(({ itemId, discount }) => ({
    itemId,
    discount,
  }));

export const compareBlackMarketPurchaseLists = (
  leftList = [],
  rightList = [],
) => {
  const left = JSON.stringify(toStorePurchaseItemList(leftList));
  const right = JSON.stringify(toStorePurchaseItemList(rightList));
  return left === right;
};

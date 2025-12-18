import XIVAPI from '@xivapi/js';

// Initialize XIVAPI
const xiv = new XIVAPI({
    language: 'en',
    verbose: false
});

// Cache
const recipeCache = new Map();
const sourceCache = new Map();

// Find Item by Name
async function findItemByName(name) {
    try {
        const params = {
            query: `Name~"${name}"`,
            sheets: 'Item'
        };

        const { results } = await xiv.search(params);

        if (results.length === 0) return null;

        const best = results[0];
        return {
            id: best.row_id,
            name: best.fields.Name
        };
    } catch (err) {
        console.error('Search error:', err);
        throw new Error(`Failed to find item: ${name}`);
    }
}

// Get Item by ID
async function getItem(id) {
    try {
        // Use the xivapi library's sheet method
        const item = await xiv.data.sheets().get('Item', id, { fields: 'Name' });

        return {
            id: item.row_id,
            name: item.fields.Name
        };
    } catch (err) {
        console.error(`Failed to get item ${id}:`, err);
        throw new Error(`Item ${id} not found`);
    }
}

// Get Recipe for Item
async function getRecipe(itemId) {
    if (recipeCache.has(itemId)) return recipeCache.get(itemId);

    try {
        // First, search for the recipe ID
        const searchParams = {
            query: `ItemResult=${itemId}`,
            sheets: 'Recipe'
        };

        const { results } = await xiv.search(searchParams);

        if (results.length === 0) {
            recipeCache.set(itemId, null);
            return null;
        }

        const recipeId = results[0].row_id;

        // Then, fetch the full recipe
        const recipe = await xiv.data.sheets().get('Recipe', recipeId);

        const row = recipe.fields;
        const ingredients = [];

        // Fields are: Ingredient (array of objects) and AmountIngredient (array of numbers)
        const ingredientArray = row.Ingredient || [];
        const amountArray = row.AmountIngredient || [];

        for (let i = 0; i < ingredientArray.length; i++) {
            const ingredient = ingredientArray[i];
            const amount = amountArray[i];

            if (ingredient && ingredient.value && amount) {
                ingredients.push({
                    itemId: ingredient.value,
                    amount: amount
                });
            }
        }

        const recipeData = {
            itemId,
            yields: row.AmountResult || 1,
            ingredients
        };

        recipeCache.set(itemId, recipeData);
        return recipeData;
    } catch (err) {
        console.error("Recipe error:", err);
        recipeCache.set(itemId, null);
        return null;
    }
}

// Check Special Shop with detailed costs (Tomestones, Tokens, etc.)
async function checkSpecialShop(itemId) {
    try {
        const { results } = await xiv.search({
            query: `ItemReceive=${itemId}`,
            sheets: 'SpecialShop'
        });

        if (results.length === 0) return null;

        console.log(`SPECIAL_SHOP found for item ${itemId}:`, JSON.stringify(results[0], null, 2));

        const shopData = results[0];
        const source = {
            type: 'special_shop',
            costs: []
        };

        // SpecialShop has arrays: ItemReceive, ItemCost, CostAmount
        const receiveArray = shopData.fields?.ItemReceive || [];
        const costArray = shopData.fields?.ItemCost || [];
        const costAmountArray = shopData.fields?.CostAmount || [];

        // Find which entry in ItemReceive matches our itemId
        for (let i = 0; i < receiveArray.length; i++) {
            if (receiveArray[i]?.value === itemId) {
                // Found the entry - now get the costs
                for (let j = 0; j < costArray.length; j++) {
                    const costItem = costArray[j];
                    const amount = costAmountArray[j];
                    if (costItem && costItem.value && amount) {
                        try {
                            const costItemData = await getItem(costItem.value);
                            source.costs.push({
                                item: costItemData.name,
                                amount: amount
                            });
                        } catch (err) {
                            source.costs.push({
                                itemId: costItem.value,
                                amount: amount
                            });
                        }
                    }
                }
                break;
            }
        }

        sourceCache.set(itemId, source);
        return source;
    } catch (err) {
        return null;
    }
}

// Detect Source
async function detectSource(itemId) {
    if (sourceCache.has(itemId)) return sourceCache.get(itemId);

    try {
        // Check Gathering
        const gatherParams = {
            query: `Item=${itemId}`,
            sheets: 'GatheringItem'
        };
        const { results: gatherResults } = await xiv.search(gatherParams);

        if (gatherResults.length > 0) {
            const source = { type: 'gathering' };
            sourceCache.set(itemId, source);
            return source;
        }

        // Check Fishing
        const fishParams = {
            query: `Item=${itemId}`,
            sheets: 'FishParameter'
        };
        const { results: fishResults } = await xiv.search(fishParams);

        if (fishResults.length > 0) {
            const source = { type: 'fishing' };
            sourceCache.set(itemId, source);
            return source;
        }

        // Check Vendor
        const shopParams = {
            query: `Item=${itemId}`,
            sheets: 'GilShopItem'
        };
        const { results: shopResults } = await xiv.search(shopParams);

        if (shopResults.length > 0) {
            const source = { type: 'vendor' };
            sourceCache.set(itemId, source);
            return source;
        }

        // Check Special Shop (Tomestones, Tokens, etc.)
        const specialShopCheck = await checkSpecialShop(itemId);
        if (specialShopCheck) return specialShopCheck;

        // Check other sources
        const additionalSources = [
            { sheet: 'SpearfishingItem', type: 'spearfishing' },
            { sheet: 'GCShop', type: 'gc_shop' },
            { sheet: 'FccShop', type: 'fcc_shop' },
            { sheet: 'GCScripShopItem', type: 'gc_scrip_shop' },
            { sheet: 'RetainerTask', type: 'retainer' },
            { sheet: 'SatisfactionSupply', type: 'satisfaction_supply' },
            { sheet: 'HWDCrafterSupply', type: 'hwd_crafter_supply' },
            { sheet: 'SubmarineDrop', type: 'submarine_drop' },
            { sheet: 'CompanyCraftSupply', type: 'company_craft_supply' },
            { sheet: 'InclusionShop', type: 'inclusion_shop' }
        ];

        for (const { sheet, type } of additionalSources) {
            const { results } = await xiv.search({
                query: `Item=${itemId}`,
                sheets: sheet
            });

            if (results.length > 0) {
                const source = { type };
                sourceCache.set(itemId, source);
                return source;
            }
        }

        // Log unknown source for debugging - dump complete object
        const itemInfo = await xiv.data.sheets().get("Item", itemId);
        console.log(`Unknown source for item ${itemId} - COMPLETE OBJECT:`, JSON.stringify(itemInfo, null, 2));

        const source = {
            type: "unknown",
            itemId: itemId,
            hint: itemInfo.fields?.ItemSearchCategory?.fields?.Name ||
                  itemInfo.fields?.ItemUICategory?.fields?.Name ||
                  "no hint available"
        };
        sourceCache.set(itemId, source);
        return source;
    } catch (err) {
        const source = { type: 'unknown' };
        sourceCache.set(itemId, source);
        return source;
    }
}
// Recursive Material Tree Builder
async function buildMaterialTree(itemId, amount, visited = new Set()) {
    if (visited.has(itemId)) {
        throw new Error(`Cycle detected: ${itemId}`);
    }

    const item = await getItem(itemId);
    const recipe = await getRecipe(itemId);

    if (!recipe) {
        const source = await detectSource(itemId);
        return { item, amount, source };
    }

    visited.add(itemId);
    const children = [];

    for (const ing of recipe.ingredients) {
        const scale = amount / recipe.yields;
        const child = await buildMaterialTree(
            ing.itemId,
            ing.amount * scale,
            new Set(visited)
        );
        children.push(child);
    }

    return {
        item,
        amount,
        source: { type: 'crafted', recipeId: itemId },
        children
    };
}

// Flatten Tree
function flattenTree(node) {
    if (!node.children) {
        return [{
            item: node.item,
            totalAmount: node.amount,
            source: node.source
        }];
    }

    const flattened = [];
    for (const child of node.children) {
        flattened.push(...flattenTree(child));
    }

    const merged = new Map();
    for (const mat of flattened) {
        if (merged.has(mat.item.id)) {
            merged.get(mat.item.id).totalAmount += mat.totalAmount;
        } else {
            merged.set(mat.item.id, mat);
        }
    }

    return Array.from(merged.values());
}

// Main Calculate Function
async function calculateMaterials(itemName) {
    const item = await findItemByName(itemName);
    if (!item) throw new Error(`Item not found: ${itemName}`);

    console.log("Found item:", item);
    const tree = await buildMaterialTree(item.id, 1);
    console.log("Material tree:", tree);
    const flattened = flattenTree(tree);
    console.log("Flattened materials:", flattened);
    return flattened;
}

// UI Functions
function showLoading() {
    const output = document.getElementById('output');
    output.innerHTML = '<div class="loading">⏳ Calculating materials...</div>';
}

function showError(message) {
    const output = document.getElementById('output');
    output.innerHTML = `<div class="error">❌ ${message}</div>`;
}

function showResults(materials) {
    const output = document.getElementById('output');

    if (materials.length === 0) {
        output.innerHTML = '<div class="error">No materials found</div>';
        return;
    }

    const html = `
        <div class="results">
            <div class="result-header">📋 Required Materials (${materials.length})</div>
            <div class="material-list">
                ${materials.map(m => {
                    let sourceDisplay = m.source.type;

                    // For special_shop, show costs
                    if (m.source.type === 'special_shop' && m.source.costs && m.source.costs.length > 0) {
                        const costStr = m.source.costs.map(c => `${c.amount}× ${c.item || c.itemId}`).join(', ');
                        sourceDisplay += ` (${costStr})`;
                    }

                    return `
                    <div class="material-item">
                        <a class="material-name" href="https://ffxiv.consolegameswiki.com/wiki/${m.item.name}">${m.item.name}</a>
                        <div class="material-meta">
                            <span class="material-amount">${Math.ceil(m.totalAmount)}×</span>
                            <span class="material-source source-${m.source.type}">${sourceDisplay}</span>
                        </div>
                    </div>
                `}).join('')}
            </div>
        </div>
    `;

    output.innerHTML = html;
}

// Event Handlers
async function handleCalculate() {
    const input = document.getElementById('itemInput');
    const button = document.getElementById('calculateBtn');
    const itemName = input.value.trim();

    if (!itemName) {
        showError('Please enter an item name');
        return;
    }

    button.disabled = true;
    showLoading();

    try {
        const materials = await calculateMaterials(itemName);
        showResults(materials);
    } catch (err) {
        showError(err.message);
        console.error(err);
    } finally {
        button.disabled = false;
    }
}

// Initialize
document.getElementById('calculateBtn').addEventListener('click', handleCalculate);
document.getElementById('itemInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleCalculate();
    }
});

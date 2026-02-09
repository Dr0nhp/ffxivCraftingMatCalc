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
        recipeCache.set(itemId, null);
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

        // Check Spearfishing
        try {
            const { results } = await xiv.search({
                query: `Item=${itemId}`,
                sheets: 'SpearfishingItem'
            });

            if (results.length > 0) {
                const source = { type: 'spearfishing' };
                sourceCache.set(itemId, source);
                return source;
            }
        } catch (err) {
            // SpearfishingItem nicht durchsuchbar
        }

        // Unknown source - kann nicht automatisch erkannt werden
        // (SpecialShop/Script Vendors sind nicht über Query durchsuchbar)
        const source = { type: "unknown" };
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

    const tree = await buildMaterialTree(item.id, 1);
    const flattened = flattenTree(tree);
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
                        <a class="material-name" target="_blank" rel="noopener noreferrer" href="https://ffxiv.consolegameswiki.com/wiki/${m.item.name}">${m.item.name}</a>
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
    } finally {
        button.disabled = false;
    }
}

// DEBUG: Test verschiedene Shop-Sheets
async function testShopSheets() {
    console.log('=== Testing Shop Sheets ===');

    const testItemId = 49225;

    // Teste verschiedene Shop-Sheet-Namen
    const shopSheets = [
        'SpecialShop',
        'ShopItem',
        'GilShop',
        'TopicSelect',
        'PreHandler',
        'CustomTalk',
        'GCShop',
        'FccShop',
        'GilShopItem'
    ];

    for (const sheetName of shopSheets) {
        console.log(`\nTesting: ${sheetName}`);

        // Test direct access
        try {
            const data = await xiv.data.sheets().get(sheetName, 1);
            console.log(`  ✓ Direct access works`);
            console.log(`  Fields:`, Object.keys(data.fields || {}));
        } catch (err) {
            console.log(`  ✗ Direct access: ${err.message}`);
        }

        // Test search
        try {
            const result = await xiv.search({ query: `Item=${testItemId}`, sheets: sheetName });
            console.log(`  ✓ Search works: ${result.results.length} results`);
            if (result.results.length > 0) {
                console.log(`  First result fields:`, Object.keys(result.results[0].fields || {}));
            }
        } catch (err) {
            console.log(`  ✗ Search: ${err.message}`);
        }
    }

    // Test: Hole Item direkt und suche nach Shop-Referenzen
    console.log('\n\nItem fields that might reference shops:');
    try {
        const item = await xiv.data.sheets().get('Item', testItemId);
        const shopRelatedFields = {};
        for (const key in item.fields) {
            if (key.toLowerCase().includes('shop') ||
                key.toLowerCase().includes('price') ||
                key.toLowerCase().includes('cost') ||
                key.toLowerCase().includes('vendor') ||
                key.toLowerCase().includes('currency')) {
                shopRelatedFields[key] = item.fields[key];
            }
        }
        console.log('Shop-related fields:', shopRelatedFields);
    } catch (err) {
        console.log('Error:', err);
    }
}

// Führe Test beim Laden aus
testShopSheets();

// Initialize
document.getElementById('calculateBtn').addEventListener('click', handleCalculate);
document.getElementById('itemInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleCalculate();
    }
});

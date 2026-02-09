import XIVAPI from '@xivapi/js';

const xiv = new XIVAPI({
    language: 'en',
    verbose: false
});

// Test verschiedene Sheet-Namen die mit Item-Sources zu tun haben könnten
const possibleSheets = [
    'GatheringItem',
    'FishParameter',
    'GilShopItem',
    'SpecialShop',
    'Achievement',
    'QuestReward',
    'ContentFinderCondition',
    'InstanceContent',
    'Treasure',
    'SpearfishingItem',
    'SubmarineDrop',
    'RetainerTask',
    'SatisfactionSupply',
    'HWDCrafterSupply',
    'FccShop',
    'GCShop',
    'GCScripShopItem',
    'ItemFood',
    'CompanyCraftSupply',
    'InclusionShop'
];

// Test Item ID (irgendein "unknown" item)
const testItemId = 5;

async function testSheets() {
    console.log('Testing sheets for item sources...\n');
    
    for (const sheetName of possibleSheets) {
        try {
            const { results } = await xiv.search({
                query: `Item=${testItemId}`,
                sheets: sheetName
            });
            
            if (results && results.length > 0) {
                console.log(`✓ ${sheetName}: Found ${results.length} results`);
                console.log(`  Sample:`, JSON.stringify(results[0], null, 2));
            } else {
                console.log(`- ${sheetName}: No results`);
            }
        } catch (err) {
            console.log(`✗ ${sheetName}: Error - ${err.message}`);
        }
    }
}

testSheets();

async function inspectSpecialShop() {
    try {
        // Hole einfach den ersten SpecialShop-Eintrag
        const shop = await xiv.data.sheets().get('SpecialShop', 1);
        console.log('SpecialShop Structure:');
        console.log(JSON.stringify(shop, null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
}

// Teste verschiedene Ansätze um Items in SpecialShops zu finden
async function testSpecialShopAccess() {
    console.log('\n=== Testing SpecialShop Access Methods ===\n');

    const testItemId = 49225; // Ein bekanntes "unknown" Item

    // Methode 1: Direkte Suche mit verschiedenen Queries
    console.log('Method 1: Direct search with different query formats');
    const queryVariants = [
        `ItemReceive=${testItemId}`,
        `ItemReceive.Item=${testItemId}`,
        `Item=${testItemId}`,
        `ItemReceive[0]=${testItemId}`
    ];

    for (const query of queryVariants) {
        try {
            const result = await xiv.search({
                query: query,
                sheets: 'SpecialShop'
            });
            console.log(`✓ Query "${query}": ${result.results.length} results`);
            if (result.results.length > 0) {
                console.log('  First result:', JSON.stringify(result.results[0], null, 2));
            }
        } catch (err) {
            console.log(`✗ Query "${query}": ${err.message}`);
        }
    }

    // Methode 2: Liste alle SpecialShops und suche manuell
    console.log('\nMethod 2: Get sheet list');
    try {
        const sheet = await xiv.data.sheets().get('SpecialShop');
        console.log('SpecialShop sheet info:', sheet);
    } catch (err) {
        console.log('Error getting sheet:', err.message);
    }

    // Methode 3: Versuche einen bekannten SpecialShop direkt abzurufen
    console.log('\nMethod 3: Direct shop access by ID');
    for (let i = 1; i <= 5; i++) {
        try {
            const shop = await xiv.data.sheets().get('SpecialShop', i);
            console.log(`Shop ${i}:`, {
                rowId: shop.row_id,
                hasItemReceive: !!shop.fields?.ItemReceive,
                itemReceiveCount: shop.fields?.ItemReceive?.length || 0
            });

            // Prüfe ob unser Test-Item in diesem Shop ist
            if (shop.fields?.ItemReceive) {
                for (let j = 0; j < shop.fields.ItemReceive.length; j++) {
                    if (shop.fields.ItemReceive[j]?.value === testItemId) {
                        console.log(`  ✓ FOUND Item ${testItemId} in shop ${i} at index ${j}!`);
                        console.log('  Shop data:', JSON.stringify(shop.fields, null, 2));
                    }
                }
            }
        } catch (err) {
            console.log(`Shop ${i}: Error - ${err.message}`);
        }
    }
}

inspectSpecialShop();
testSpecialShopAccess();

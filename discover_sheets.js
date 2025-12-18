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

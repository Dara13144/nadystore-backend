const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL || 'https://ueziueclbgymbynuxpby.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const client = createClient(url, key);

async function checkBuckets() {
  console.log('Checking Supabase Storage buckets...');
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error) {
    console.error('List buckets error:', error);
    return;
  }
  console.log('Available buckets:', buckets.map(b => `${b.name} (public: ${b.public})`));
  
  const neededBuckets = ['games', 'packages', 'uploads'];
  for (const bName of neededBuckets) {
    const existing = buckets.find(b => b.name === bName);
    if (!existing) {
      console.log(`Creating public bucket "${bName}"...`);
      const { error: cErr } = await client.storage.createBucket(bName, { public: true });
      if (cErr) console.error(`Create bucket ${bName} error:`, cErr);
      else console.log(`✓ Bucket "${bName}" created successfully!`);
    } else {
      console.log(`✓ Bucket "${bName}" is available (public: ${existing.public})`);
    }
  }

  // Test uploading a small test image to 'games' bucket
  console.log('Testing upload to "games" bucket...');
  const testBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const testPath = `test-check-${Date.now()}.png`;
  const { data: uploadData, error: upErr } = await client.storage.from('games').upload(testPath, testBuffer, {
    contentType: 'image/png',
    upsert: true
  });
  if (upErr) {
    console.error('Upload test error:', upErr);
  } else {
    const { data: urlData } = client.storage.from('games').getPublicUrl(testPath);
    console.log('✓ Upload test successful! Public URL:', urlData.publicUrl);
    // Cleanup test
    await client.storage.from('games').remove([testPath]);
    console.log('✓ Test file cleaned up.');
  }
}

checkBuckets().catch(console.error);

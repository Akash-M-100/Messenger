import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

(async () => {
  try {
    const msg = await db.message.findUnique({
      where: { id: 'cmpv66nld0003vgm4a077xygp' }
    });
    
    if (!msg) {
      console.log('❌ Message not found in database');
      process.exit(1);
    }
    
    console.log('\n════════════════════════════════════');
    console.log('   📨 MESSAGE VERIFICATION TEST');
    console.log('════════════════════════════════════\n');
    
    console.log('Message ID:', msg.id);
    console.log('Channel:', msg.channel);
    console.log('To:', msg.toAddress);
    console.log('Body:', msg.body);
    console.log('Status:', msg.status);
    console.log('Created At:', msg.createdAt);
    
    console.log('\n════════════════════════════════════');
    console.log('   ✅ VERIFICATION RESULTS');
    console.log('════════════════════════════════════\n');
    
    const check1 = msg ? '✅ YES' : '❌ NO';
    const check2 = (msg.status === 'QUEUED' || msg.status === 'DISPATCHED') ? '✅ YES' : '❌ NO';
    const check3 = (msg.status === 'DELIVERED' || msg.status === 'DISPATCHED') ? '✅ YES' : '❌ NO';
    
    console.log('1️⃣  Message Saved to DB:', check1);
    console.log('2️⃣  Message Queued:', check2, `(Status: ${msg.status})`);
    console.log('3️⃣  Message Sent/Processed:', check3, `(Status: ${msg.status})`);
    
    console.log('\n════════════════════════════════════\n');
    
    await db.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();

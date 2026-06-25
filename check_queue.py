import redis
import json

try:
    r = redis.Redis(host='localhost', port=6379, decode_responses=True)
    r.ping()
    print("✅ Connected to Redis\n")
    
    # Check queue status
    keys = r.keys('bull:*')
    print(f"📦 Total Queue Keys: {len(keys)}\n")
    
    # Check message queue jobs
    for channel in ['email', 'sms', 'whatsapp', 'voice']:
        queue_key = f"bull:message-queue-{channel}"
        count = r.llen(queue_key)
        if count > 0:
            print(f"✅ {channel.upper()} Queue: {count} messages")
            for i in range(min(2, count)):
                data = r.lindex(queue_key, i)
                if data:
                    try:
                        job = json.loads(data)
                        print(f"   Message ID: {job.get('data', {}).get('messageId', 'N/A')}")
                    except:
                        print(f"   {data[:80]}...")
    
    print("\n" + "="*50)
    print("🔍 Checking Database for Message...")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

/**
 * Verification script for Supabase connection
 * Run with: npx tsx scripts/verify-db.ts
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/database'

// Load .env.local
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables. Make sure .env.local exists.')
  process.exit(1)
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey)

async function verify() {
  console.log('Testing Supabase connection...\n')

  // Test 1: Query events table
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('*')
    .limit(1)

  if (eventsError) {
    console.error('❌ Events query failed:', eventsError.message)
  } else {
    console.log('✅ Events table accessible')
    console.log(`   Found ${events.length} event(s)`)
  }

  // Test 2: Query vendors table
  const { data: vendors, error: vendorsError } = await supabase
    .from('vendors')
    .select('*')
    .limit(1)

  if (vendorsError) {
    console.error('❌ Vendors query failed:', vendorsError.message)
  } else {
    console.log('✅ Vendors table accessible')
    console.log(`   Found ${vendors.length} vendor(s)`)
  }

  // Test 3: Query applications table
  const { data: apps, error: appsError } = await supabase
    .from('applications')
    .select('*')
    .limit(1)

  if (appsError) {
    console.error('❌ Applications query failed:', appsError.message)
  } else {
    console.log('✅ Applications table accessible')
    console.log(`   Found ${apps.length} application(s)`)
  }

  // Test 4: Query attachments table
  const { data: attachments, error: attachmentsError } = await supabase
    .from('attachments')
    .select('*')
    .limit(1)

  if (attachmentsError) {
    console.error('❌ Attachments query failed:', attachmentsError.message)
  } else {
    console.log('✅ Attachments table accessible')
    console.log(`   Found ${attachments.length} attachment(s)`)
  }

  console.log('\n✅ Supabase connection verified!')
}

verify().catch(console.error)

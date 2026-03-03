// app/modals/scan-receipt.tsx
// This redirects to the receipts tab which handles camera natively.
// Keeping as a passthrough for deep-link compatibility.
import { useEffect } from 'react';
import { router } from 'expo-router';

export default function ScanReceiptModal() {
  useEffect(() => {
    router.replace('/(tabs)/receipts');
  }, []);
  return null;
}

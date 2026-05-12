import { permanentRedirect } from 'next/navigation';

// Phase 4 consolidated subscription pricing under /pricing.
// /plans is preserved as a permanent redirect for any external links.
export default function PlansPage(): never {
  permanentRedirect('/pricing');
}

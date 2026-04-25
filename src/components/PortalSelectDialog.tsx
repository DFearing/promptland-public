import type { PortalDestination } from '../areas/types'
import AreaTransitionDialog from './AreaTransitionDialog'

interface Props {
  open: boolean
  /** Flavor name of the portal hub room (e.g. "The Threshold Stone"). */
  title: string
  /** Flavor description of the portal hub room. */
  description: string
  /** Previously generated areas reachable through this hub. */
  destinations: PortalDestination[]
  /** Player chose "Forge a new path" — triggers fresh LLM generation. */
  onForge: () => void
  /** Player chose to travel to an existing destination. */
  onTravel: (destination: PortalDestination) => void
  /** Player chose "Step back" — return to exploring. */
  onDismiss: () => void
}

/**
 * Portal Hub selection dialog — shown when the player steps on a
 * portalHub tile. Lists previously generated destinations and offers
 * the option to forge a fresh path (LLM generation).
 */
export default function PortalSelectDialog({
  open,
  title,
  description,
  destinations,
  onForge,
  onTravel,
  onDismiss,
}: Props) {
  // Sort destinations newest-first so the most recent generation is
  // at the top of the list, closest to the "Forge a new path" button.
  const sorted = [...destinations].sort(
    (a, b) => b.generatedAt - a.generatedAt,
  )

  const actions = [
    {
      label: 'Forge a new path',
      onClick: onForge,
      primary: true,
    },
    ...sorted.map((dest) => ({
      label: `Travel to ${dest.name}`,
      onClick: () => onTravel(dest),
    })),
    {
      label: 'Step back',
      onClick: onDismiss,
    },
  ]

  return (
    <AreaTransitionDialog
      open={open}
      title={title}
      body={
        <p>{description}</p>
      }
      actions={actions}
      onDismiss={onDismiss}
    />
  )
}

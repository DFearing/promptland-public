import AreaTransitionDialog from './AreaTransitionDialog'

interface Props {
  open: boolean
  onContinueWithout: () => void
  onOpenSettings: () => void
}

/**
 * Shown when a player enters an exit tile that needs generation but no
 * LLM connection is configured. Two paths out: flag this tile as no-gen
 * and reveal empty, or open Settings so the player can configure an LLM.
 */
export default function NoLLMDialog({
  open,
  onContinueWithout,
  onOpenSettings,
}: Props) {
  return (
    <AreaTransitionDialog
      open={open}
      title="No LLM Configured"
      body={
        <p>
          The path ahead can be shaped by a language model, but no LLM
          connection is set up yet. You can continue without generated
          content (this tile will stay empty), or configure an LLM in
          Settings to unlock procedural area generation.
        </p>
      }
      actions={[
        { label: 'Continue without generation', onClick: onContinueWithout },
        { label: 'Set up LLM', onClick: onOpenSettings, primary: true },
      ]}
      onDismiss={onContinueWithout}
    />
  )
}

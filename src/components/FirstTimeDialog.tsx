import AreaTransitionDialog from './AreaTransitionDialog'

interface Props {
  open: boolean
  onContinue: () => void
  onContinueWithout: () => void
}

/**
 * Shown once per browser session the first time a player enters an exit
 * tile with generation available. Tutorial tone: explains what's about
 * to happen (fight masks gen latency) and offers an opt-out.
 */
export default function FirstTimeDialog({
  open,
  onContinue,
  onContinueWithout,
}: Props) {
  return (
    <AreaTransitionDialog
      open={open}
      title="New Territory Ahead"
      body={
        <p>
          The world beyond this point will be shaped by a language model.
          A guardian may bar your path while the new area takes form.
          Defeat it to proceed — or continue without generation if you
          prefer to explore an empty tile.
        </p>
      }
      actions={[
        { label: 'Continue without generation', onClick: onContinueWithout },
        { label: 'Continue', onClick: onContinue, primary: true },
      ]}
      onDismiss={onContinueWithout}
    />
  )
}

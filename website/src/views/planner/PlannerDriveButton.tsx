import { FC, useState } from 'react';
import { Cloud } from 'react-feather';

import type { PlannerSave } from 'types/schemas/cloudSave';
import { isDriveConfigured } from 'apis/googleDrive';
import CloseButton from 'views/components/CloseButton';
import DriveSync from 'views/components/DriveSync';
import Modal from 'views/components/Modal';

type Props = {
  onLoaded: (save: PlannerSave) => void;
};

const PlannerDriveButton: FC<Props> = ({ onLoaded }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!isDriveConfigured()) return null;

  return (
    <>
      <button
        className="btn btn-svg btn-outline-primary"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <Cloud className="svg" />
        <p>Drive</p>
      </button>

      <Modal isOpen={isOpen} onRequestClose={() => setIsOpen(false)} animate>
        <CloseButton absolutePositioned onClick={() => setIsOpen(false)} />
        <DriveSync kind="planner" onLoaded={onLoaded} />
      </Modal>
    </>
  );
};

export default PlannerDriveButton;

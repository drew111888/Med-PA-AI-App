
import React from 'react';
import PracticeSettings from './PracticeSettings.tsx';

/**
 * Legacy wrapper for the Settings view.
 * All logic has been migrated to PracticeSettings.tsx for robust naming.
 */
const Settings: React.FC = () => {
  return <PracticeSettings />;
};

export default Settings;

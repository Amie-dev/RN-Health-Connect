import React from 'react';
import { StatusBar } from 'expo-status-bar';
import HealthDashboard from './src/screens/HealthDashboard';

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <HealthDashboard />
    </>
  );
}

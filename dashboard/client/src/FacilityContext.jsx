import { createContext, useContext, useState } from "react";

const FacilityContext = createContext();

export function FacilityProvider({ children }) {
  const [facility, setFacility] = useState("Dubai"); 

  return (
    <FacilityContext.Provider value={{ facility, setFacility }}>
      {children}
    </FacilityContext.Provider>
  );
}

export function useFacility() {
  return useContext(FacilityContext);
}

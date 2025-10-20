
import React from 'react';

const Header = (): React.JSX.Element => {
  return (
    <header className="sticky top-0 z-50 bg-primary text-white shadow-md">
      <div className="mx-auto flex h-[66px] max-w-md items-center justify-center px-4">
        <h1 className="text-xl font-bold">Cakes and Memories Cebu</h1>
      </div>
    </header>
  );
};

export default Header;

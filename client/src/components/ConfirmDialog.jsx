import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';

const ConfirmContext = createContext(() => Promise.resolve(false));

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const askConfirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        message,
        title: options.title || '确认操作',
        confirmText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消',
        danger: options.danger !== false
      });
    });
  }, []);

  const close = (result) => {
    if (resolverRef.current) resolverRef.current(result);
    resolverRef.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={askConfirm}>
      {children}
      <Dialog open={Boolean(state)} onClose={() => close(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{state?.title || '确认操作'}</DialogTitle>
        <DialogContent>{state?.message || ''}</DialogContent>
        <DialogActions>
          <Button onClick={() => close(false)}>{state?.cancelText || '取消'}</Button>
          <Button variant="contained" color={state?.danger ? 'error' : 'primary'} onClick={() => close(true)}>
            {state?.confirmText || '确认'}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

export default ConfirmProvider;

import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Link as LinkIcon,
  ContentCopy as CopyIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import { useColors } from '../../ThemeContext'

interface ContextMenuProps {
  open: boolean
  position: { x: number; y: number }
  targetType: 'canvas' | 'node' | 'edge'
  targetId?: string
  onClose: () => void
  onAddNode: (type: 'personality' | 'memory', position: { x: number; y: number }) => void
  onDeleteNode: (id: string) => void
  onDeleteEdge: (id: string) => void
  onEditNode: (id: string) => void
}

export function ContextMenu({
  open,
  position,
  targetType,
  targetId,
  onClose,
  onAddNode,
  onDeleteNode,
  onDeleteEdge,
  onEditNode,
}: ContextMenuProps) {
  const c = useColors()

  const handleAddMemoryNode = () => {
    onAddNode('memory', position)
    onClose()
  }

  const handleAddPersonalityNode = () => {
    onAddNode('personality', position)
    onClose()
  }

  const handleEditNode = () => {
    if (targetId) onEditNode(targetId)
    onClose()
  }

  const handleDeleteNode = () => {
    if (targetId) onDeleteNode(targetId)
    onClose()
  }

  const handleDeleteEdge = () => {
    if (targetId) onDeleteEdge(targetId)
    onClose()
  }

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={{ top: position.y, left: position.x }}
      slotProps={{
        paper: {
          sx: {
            bgcolor: c.bgCard,
            borderRadius: '10px',
            border: `1px solid ${c.border}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            minWidth: 200,
            '& .MuiMenuItem-root': {
              fontSize: 14,
              py: 0.75,
              color: c.text,
              '&:hover': {
                bgcolor: c.bgHover,
              },
            },
          },
        },
      }}
    >
      {targetType === 'canvas' && (
        <MenuItem key="add-memory" onClick={handleAddMemoryNode}>
          <ListItemIcon>
            <AddIcon fontSize="small" sx={{ color: '#5B8DEF' }} />
          </ListItemIcon>
          <ListItemText>添加记忆节点</ListItemText>
        </MenuItem>
      )}

      {targetType === 'node' && [
        <MenuItem key="edit" onClick={handleEditNode}>
          <ListItemIcon>
            <EditIcon fontSize="small" sx={{ color: c.primary }} />
          </ListItemIcon>
          <ListItemText>编辑节点</ListItemText>
        </MenuItem>,
        <MenuItem key="connect" onClick={handleEditNode}>
          <ListItemIcon>
            <LinkIcon fontSize="small" sx={{ color: c.success }} />
          </ListItemIcon>
          <ListItemText>添加连接</ListItemText>
        </MenuItem>,
        <Divider key="divider" sx={{ borderColor: c.border }} />,
        <MenuItem key="copy" onClick={handleEditNode}>
          <ListItemIcon>
            <CopyIcon fontSize="small" sx={{ color: c.textSecondary }} />
          </ListItemIcon>
          <ListItemText>复制节点</ListItemText>
        </MenuItem>,
        <MenuItem key="delete" onClick={handleDeleteNode}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" sx={{ color: c.error }} />
          </ListItemIcon>
          <ListItemText>删除节点</ListItemText>
        </MenuItem>,
      ]}

      {targetType === 'edge' && (
        <MenuItem onClick={handleDeleteEdge}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" sx={{ color: c.error }} />
          </ListItemIcon>
          <ListItemText>删除连接</ListItemText>
        </MenuItem>
      )}
    </Menu>
  )
}

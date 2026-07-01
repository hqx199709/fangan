const { createApp, ref, onMounted } = Vue;

// 假设后端运行在 3000 端口，同一局域网下访问时，可以配置为服务器IP
const API_BASE = 'http://localhost:3000';

createApp({
    setup() {
        const loading = ref(false);
        const assets = ref([]);
        
        // 可选模块大类与子模块 (根据配置清单主要.xlsx提取并分类)
        const moduleCategories = [
            {
                category: '全自动样品处理系统',
                modules: ['进出样模块', '倾倒式进样模块', '离心模块', '离心机', '开盖模块', '分杯模块', '封膜模块', '去膜模块', '低温存储单元', '低温存储单元（5550）']
            },
            {
                category: '全自动生化分析仪',
                modules: ['Biossays C8', 'Biossays C10', 'LST008 α<SSS>', 'LST008 α<SS>', 'LST008 α<S>', 'AU5811', 'AU5821', 'AU5831']
            },
            {
                category: '全自动化学发光免疫分析仪',
                modules: ['MAGLUMI X8', 'MAGLUMI X10']
            },
            {
                category: '全自动凝血分析仪',
                modules: ['Hemolumi H6']
            },
            {
                category: '电解质分析仪',
                modules: ['E6Plus']
            }
        ];

        // 筛选条件
        const filter = ref({
            length: '',
            width: '',
            modules: [],
            moduleQuantities: {},
            keyword: ''
        });

        // 弹窗控制
        const showUploadModal = ref(false);
        const uploading = ref(false);
        const displayMode = ref('list');
        const showMobileFilter = ref(false);
        
        // 上传与编辑状态
        const isEditMode = ref(false);
        const editAssetId = ref(null);
        const uploadForm = ref({
            name: '',
            length: '',
            width: '',
            modules: [],
            moduleQuantities: {},
            planImage: null,
            effectImage: null,
            planImagePreview: '',
            effectImagePreview: ''
        });

        // 详情预览
        const selectedAsset = ref(null);
        const currentView = ref('plan'); // 'plan' or 'effect'

        // 获取素材列表
        let allAssetsCache = null;
        const fetchAssets = async () => {
            loading.value = true;
            try {
                const isStaticEnv = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:';
                
                if (isStaticEnv) {
                    if (!allAssetsCache) {
                        const res = await fetch('data.json');
                        if (!res.ok) throw new Error('网络请求失败');
                        allAssetsCache = await res.json();
                    }
                    
                    let result = allAssetsCache;
                    
                    if (filter.value.keyword) {
                        const kw = filter.value.keyword.toLowerCase();
                        result = result.filter(a => a.name.toLowerCase().includes(kw));
                    }
                    if (filter.value.length) {
                        result = result.filter(a => a.length <= parseFloat(filter.value.length));
                    }
                    if (filter.value.width) {
                        result = result.filter(a => a.width <= parseFloat(filter.value.width));
                    }
                    if (filter.value.modules.length > 0) {
                        result = result.filter(a => {
                            for (const m of filter.value.modules) {
                                const qty = filter.value.moduleQuantities[m] || 1;
                                // 后端存的格式是 "模块名(数量)"，我们只需简单的字符串包含判断
                                const searchStr = `${m}(${qty})`;
                                if (!a.modules.includes(searchStr)) return false;
                            }
                            return true;
                        });
                    }
                    assets.value = result;
                } else {
                    const params = new URLSearchParams();
                    if (filter.value.length) params.append('length', filter.value.length);
                    if (filter.value.width) params.append('width', filter.value.width);
                    if (filter.value.keyword) params.append('keyword', filter.value.keyword);
                    if (filter.value.modules.length > 0) {
                        const modulesWithQty = filter.value.modules.map(m => {
                            const qty = filter.value.moduleQuantities[m] || 1;
                            return `${m}(${qty})`;
                        });
                        params.append('modules', modulesWithQty.join(','));
                    }

                    const response = await fetch(`${API_BASE}/api/assets?${params.toString()}`);
                    if (!response.ok) throw new Error('网络请求失败');
                    assets.value = await response.json();
                }
            } catch (error) {
                console.error('获取素材失败:', error);
                alert('获取数据失败');
            } finally {
                loading.value = false;
            }
        };

        const resetFilter = () => {
            filter.value = {
                length: '',
                width: '',
                modules: [],
                moduleQuantities: {},
                keyword: ''
            };
            fetchAssets();
        };

        // 粘贴图片事件
        const handlePaste = (field, event) => {
            const clipboardData = event.clipboardData || window.clipboardData;
            if (!clipboardData) return;
            const items = clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    uploadForm.value[field] = blob;
                    uploadForm.value[field + 'Preview'] = '✅ 已粘贴截图 (大小: ' + Math.round(blob.size/1024) + 'KB)';
                    return; // 只取第一张图
                }
            }
        };

        // 处理文件选择
        const handleFileChange = (field, event) => {
            const file = event.target.files[0];
            if (file) {
                uploadForm.value[field] = file;
                uploadForm.value[field + 'Preview'] = '✅ 已选择图片: ' + file.name;
            }
        };

        const openUploadModal = () => {
            isEditMode.value = false;
            editAssetId.value = null;
            uploadForm.value = {
                name: '', length: '', width: '', modules: [], moduleQuantities: {},
                planImage: null, effectImage: null, planImagePreview: '', effectImagePreview: ''
            };
            showUploadModal.value = true;
        };

        const openEditModal = () => {
            if (!selectedAsset.value) return;
            isEditMode.value = true;
            editAssetId.value = selectedAsset.value.id;
            
            const mQty = {};
            const mList = [];
            parseModules(selectedAsset.value.modules).forEach(mStr => {
                const match = mStr.match(/(.+)\((\d+)\)/);
                if (match) {
                    mList.push(match[1]);
                    mQty[match[1]] = parseInt(match[2], 10);
                } else {
                    mList.push(mStr);
                    mQty[mStr] = 1;
                }
            });

            uploadForm.value = {
                name: selectedAsset.value.name,
                length: selectedAsset.value.length,
                width: selectedAsset.value.width,
                modules: mList,
                moduleQuantities: mQty,
                planImage: null,
                effectImage: null,
                planImagePreview: '已在服务器保存原图，不需修改请留空',
                effectImagePreview: selectedAsset.value.effect_image ? '已在服务器保存原图，不需修改请留空' : ''
            };
            
            selectedAsset.value = null; // 关闭预览窗口
            showUploadModal.value = true;
        };

        // 提交上传
        const submitUpload = async () => {
            // 如果是新增模式且没有平面图，报错
            if (!isEditMode.value && !uploadForm.value.planImage) {
                alert('请上传或粘贴平面尺寸图！');
                return;
            }

            uploading.value = true;
            const formData = new FormData();
            formData.append('name', uploadForm.value.name);
            formData.append('length', uploadForm.value.length);
            formData.append('width', uploadForm.value.width);
            
            // 处理模块数量 (格式：模块名(数量))
            const modulesWithQty = uploadForm.value.modules.map(m => {
                const qty = uploadForm.value.moduleQuantities[m] || 1;
                return `${m}(${qty})`;
            });
            formData.append('modules', modulesWithQty.join(','));
            
            if (uploadForm.value.planImage) {
                formData.append('planImage', uploadForm.value.planImage);
            }
            if (uploadForm.value.effectImage) {
                formData.append('effectImage', uploadForm.value.effectImage);
            }

            try {
                const url = isEditMode.value ? `${API_BASE}/api/assets/${editAssetId.value}` : `${API_BASE}/api/assets`;
                const method = isEditMode.value ? 'PUT' : 'POST';

                const response = await fetch(url, {
                    method: method,
                    body: formData
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error || `HTTP 错误状态码: ${response.status}`);
                }
                
                alert(isEditMode.value ? '修改成功！' : '上传成功！');
                showUploadModal.value = false;
                
                // 清空表单
                uploadForm.value = {
                    name: '', length: '', width: '', modules: [], moduleQuantities: {},
                    planImage: null, effectImage: null, planImagePreview: '', effectImagePreview: ''
                };
                
                // 刷新列表
                fetchAssets();
            } catch (error) {
                console.error('上传失败:', error);
                alert(`上传失败: ${error.message}`);
            } finally {
                uploading.value = false;
            }
        };

        // 查看素材详情
        const viewAsset = (asset) => {
            selectedAsset.value = asset;
            currentView.value = 'plan';
        };

        // 辅助方法：解析模块字符串，提取出标签内容
        const parseModules = (modulesStr) => {
            if (!modulesStr) return [];
            return modulesStr.split(',').filter(m => m.trim() !== '');
        };

        // 删除素材
        const deleteAssetConfirm = async () => {
            if (!selectedAsset.value) return;
            if (!confirm('确定要彻底删除这个方案吗？此操作不可恢复。')) return;
            
            try {
                const response = await fetch(`${API_BASE}/api/assets/${selectedAsset.value.id}`, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error || `HTTP ${response.status}`);
                }
                alert('删除成功！');
                selectedAsset.value = null; // 关闭弹窗
                fetchAssets(); // 刷新列表
            } catch (error) {
                console.error('删除失败:', error);
                alert(`删除失败: ${error.message}`);
            }
        };

        // 辅助方法：获取缩略图 (优先显示效果图，没有则显示平面图)
        const getThumbnail = (asset) => {
            const path = asset.effect_image || asset.plan_image;
            return `${API_BASE}${path}`;
        };

        // 辅助方法：获取完整图片URL
        const getImageUrl = (path) => {
            if (!path) return '';
            return `${API_BASE}${path}`;
        };

        // 辅助方法：下载当前查看的图片
        const downloadAsset = async () => {
            if (!selectedAsset.value) return;
            const path = currentView.value === 'plan' ? selectedAsset.value.plan_image : selectedAsset.value.effect_image;
            if (!path) return;
            
            const url = `${API_BASE}${path}`;
            try {
                const response = await fetch(url);
                const blob = await response.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = downloadUrl;
                // 获取原始文件名
                const filename = path.split('/').pop() || 'download.jpg';
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(downloadUrl);
                document.body.removeChild(a);
            } catch (e) {
                console.error('下载失败', e);
                // 降级方案：在新窗口打开
                window.open(url, '_blank');
            }
        };

        // 初始化加载
        onMounted(() => {
            // fetchAssets(); 
            // 暂时不自动调用，提示用户启动后端
        });

        return {
            loading, assets, moduleCategories, filter,
            showUploadModal, uploading, uploadForm,
            selectedAsset, currentView, isEditMode, displayMode, showMobileFilter,
            fetchAssets, resetFilter, handleFileChange, handlePaste, submitUpload,
            viewAsset, parseModules, getThumbnail, getImageUrl, downloadAsset, deleteAssetConfirm,
            openUploadModal, openEditModal
        };
    }
}).mount('#app');
